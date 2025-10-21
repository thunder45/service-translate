/**
 * Network Configuration Manager
 * Handles local network discovery and configuration for WebSocket server
 */

import * as os from 'os';
import * as dns from 'dns';
import { promisify } from 'util';

export interface NetworkInfo {
  localIp: string;
  networkInterfaces: NetworkInterface[];
  hostname: string;
  websocketUrl: string;
  httpUrl: string;
  qrCodeData: string;
}

export interface NetworkInterface {
  name: string;
  address: string;
  family: 'IPv4' | 'IPv6';
  internal: boolean;
  cidr: string;
}

class NetworkConfigManager {
  /**
   * Get local network information for WebSocket server
   */
  public async getNetworkInfo(websocketPort: number, httpPort: number): Promise<NetworkInfo> {
    const hostname = os.hostname();
    const localIp = await this.getLocalIpAddress();
    const networkInterfaces = this.getNetworkInterfaces();

    const websocketUrl = `ws://${localIp}:${websocketPort}`;
    const httpUrl = `http://${localIp}:${httpPort}`;
    
    // Create QR code data for easy client connection
    const qrCodeData = JSON.stringify({
      websocketUrl,
      httpUrl,
      serviceName: 'Service Translate',
      timestamp: new Date().toISOString(),
    });

    return {
      localIp,
      networkInterfaces,
      hostname,
      websocketUrl,
      httpUrl,
      qrCodeData,
    };
  }

  /**
   * Get the primary local IP address (non-loopback)
   */
  public async getLocalIpAddress(): Promise<string> {
    const interfaces = os.networkInterfaces();
    
    // Priority order: Ethernet, WiFi, other
    const priorityOrder = ['eth0', 'en0', 'wlan0', 'Wi-Fi', 'Ethernet'];
    
    for (const interfaceName of priorityOrder) {
      const networkInterface = interfaces[interfaceName];
      if (networkInterface) {
        for (const addr of networkInterface) {
          if (addr.family === 'IPv4' && !addr.internal) {
            return addr.address;
          }
        }
      }
    }

    // Fallback: find any non-internal IPv4 address
    for (const interfaceName of Object.keys(interfaces)) {
      const networkInterface = interfaces[interfaceName];
      if (networkInterface) {
        for (const addr of networkInterface) {
          if (addr.family === 'IPv4' && !addr.internal) {
            return addr.address;
          }
        }
      }
    }

    // Last resort: 127.0.0.1
    return '127.0.0.1';
  }

  /**
   * Get all network interfaces
   */
  public getNetworkInterfaces(): NetworkInterface[] {
    const interfaces = os.networkInterfaces();
    const result: NetworkInterface[] = [];

    for (const [name, addresses] of Object.entries(interfaces)) {
      if (addresses) {
        for (const addr of addresses) {
          result.push({
            name,
            address: addr.address,
            family: addr.family as 'IPv4' | 'IPv6',
            internal: addr.internal,
            cidr: addr.cidr || `${addr.address}/${addr.family === 'IPv4' ? '24' : '64'}`,
          });
        }
      }
    }

    return result;
  }

  /**
   * Test network connectivity to a host
   */
  public async testConnectivity(host: string, port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const net = require('net');
      const socket = new net.Socket();
      
      const timeout = setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, 5000);

      socket.connect(port, host, () => {
        clearTimeout(timeout);
        socket.destroy();
        resolve(true);
      });

      socket.on('error', () => {
        clearTimeout(timeout);
        resolve(false);
      });
    });
  }

  /**
   * Generate connection instructions for clients
   */
  public generateConnectionInstructions(networkInfo: NetworkInfo): string {
    return `
# Service Translate - Client Connection Instructions

## Quick Connect
1. Connect your device to the same WiFi network as this computer
2. Open a web browser on your mobile device
3. Go to: ${networkInfo.httpUrl}
4. Enter the session ID when prompted

## Network Information
- Server IP Address: ${networkInfo.localIp}
- WebSocket URL: ${networkInfo.websocketUrl}
- Web Client URL: ${networkInfo.httpUrl}
- Server Hostname: ${networkInfo.hostname}

## Available Network Interfaces
${networkInfo.networkInterfaces
  .filter(iface => !iface.internal)
  .map(iface => `- ${iface.name}: ${iface.address} (${iface.family})`)
  .join('\n')}

## Troubleshooting
- Ensure your device is connected to the same WiFi network
- Check that firewall is not blocking ports ${networkInfo.websocketUrl.split(':').pop()} and ${networkInfo.httpUrl.split(':').pop()}
- Try accessing ${networkInfo.httpUrl} directly in your browser
- If connection fails, try using the server's hostname: http://${networkInfo.hostname}:${networkInfo.httpUrl.split(':').pop()}

## QR Code Data
${networkInfo.qrCodeData}
`;
  }

  /**
   * Check if ports are available
   */
  public async checkPortAvailability(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const net = require('net');
      const server = net.createServer();

      server.listen(port, () => {
        server.once('close', () => {
          resolve(true);
        });
        server.close();
      });

      server.on('error', () => {
        resolve(false);
      });
    });
  }

  /**
   * Find available ports starting from a base port
   */
  public async findAvailablePorts(basePort: number, count: number = 2): Promise<number[]> {
    const availablePorts: number[] = [];
    let currentPort = basePort;

    while (availablePorts.length < count) {
      if (await this.checkPortAvailability(currentPort)) {
        availablePorts.push(currentPort);
      }
      currentPort++;
      
      // Prevent infinite loop
      if (currentPort > basePort + 100) {
        throw new Error(`Could not find ${count} available ports starting from ${basePort}`);
      }
    }

    return availablePorts;
  }

  /**
   * Setup mDNS service discovery (if available)
   */
  public async setupServiceDiscovery(serviceName: string, port: number): Promise<void> {
    try {
      // Try to load mdns module (optional dependency)
      const mdns = require('mdns');
      
      const advertisement = mdns.createAdvertisement(mdns.tcp('http'), port, {
        name: serviceName,
        txtRecord: {
          service: 'service-translate',
          version: '1.0.0',
          protocol: 'websocket',
        },
      });

      advertisement.start();
      console.log(`mDNS service discovery started for ${serviceName} on port ${port}`);
    } catch (error) {
      console.log('mDNS service discovery not available (optional feature)');
    }
  }

  /**
   * Generate firewall configuration instructions
   */
  public generateFirewallInstructions(websocketPort: number, httpPort: number): string {
    return `
# Firewall Configuration Instructions

## Windows Firewall
1. Open Windows Defender Firewall with Advanced Security
2. Click "Inbound Rules" → "New Rule"
3. Select "Port" → "TCP" → Specific ports: ${websocketPort},${httpPort}
4. Allow the connection → Apply to all profiles → Name: "Service Translate"

## macOS Firewall
1. System Preferences → Security & Privacy → Firewall
2. Click "Firewall Options"
3. Add applications or allow incoming connections for ports ${websocketPort} and ${httpPort}

## Linux (UFW)
sudo ufw allow ${websocketPort}/tcp
sudo ufw allow ${httpPort}/tcp

## Router Configuration (if needed)
- Port forwarding may be required for external access
- Forward ports ${websocketPort} and ${httpPort} to this computer's IP: ${this.getLocalIpAddress()}
`;
  }
}

// Export singleton instance
export const networkConfigManager = new NetworkConfigManager();

// Export convenience functions
export async function getNetworkInfo(websocketPort: number, httpPort: number): Promise<NetworkInfo> {
  return await networkConfigManager.getNetworkInfo(websocketPort, httpPort);
}

export async function findAvailablePorts(basePort: number, count?: number): Promise<number[]> {
  return await networkConfigManager.findAvailablePorts(basePort, count);
}

export function generateConnectionInstructions(networkInfo: NetworkInfo): string {
  return networkConfigManager.generateConnectionInstructions(networkInfo);
}
