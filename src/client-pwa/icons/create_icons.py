#!/usr/bin/env python3
import base64
from PIL import Image, ImageDraw, ImageFont
import io

def create_icon(size, filename):
    # Criar uma imagem com fundo gradiente azul
    img = Image.new('RGB', (size, size), color='#667eea')
    draw = ImageDraw.Draw(img)
    
    # Tentar usar uma fonte, se não conseguir usar a padrão
    try:
        font_size = max(size // 3, 12)
        font = ImageFont.truetype("/System/Library/Fonts/Arial.ttf", font_size)
    except:
        font_size = max(size // 4, 10)
        font = ImageFont.load_default()
    
    # Desenhar o texto "ST" centralizado
    text = "ST"
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    
    x = (size - text_width) // 2
    y = (size - text_height) // 2
    
    draw.text((x, y), text, fill='white', font=font)
    
    # Salvar a imagem
    img.save(filename, 'PNG')
    print(f"Created {filename} ({size}x{size})")

# Criar os ícones necessários
create_icon(144, 'icon-144x144.png')
create_icon(32, 'icon-32x32.png')
create_icon(16, 'icon-16x16.png')

print("All icons created successfully!")
