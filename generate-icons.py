#!/usr/bin/env python3
"""
PWA用アイコン生成スクリプト
シンプルなPNG画像を複数サイズで生成
"""

import os
from PIL import Image, ImageDraw

def create_icon(size, output_path):
    """指定サイズのアイコンを生成"""
    # ベース画像を作成（正方形）
    img = Image.new('RGBA', (size, size), (26, 26, 26, 255))  # #1a1a1a
    draw = ImageDraw.Draw(img)
    
    # サイズに応じてスケール調整
    scale = size / 512
    
    # メインのチャットバブル1（青）
    bubble1_x = int(80 * scale)
    bubble1_y = int(120 * scale)
    bubble1_w = int(240 * scale)
    bubble1_h = int(160 * scale)
    bubble1_r = int(32 * scale)
    
    draw.rounded_rectangle(
        [bubble1_x, bubble1_y, bubble1_x + bubble1_w, bubble1_y + bubble1_h],
        radius=bubble1_r,
        fill=(88, 166, 255, 230)  # #58a6ff with opacity
    )
    
    # チャットバブル2（緑）
    bubble2_x = int(192 * scale)
    bubble2_y = int(232 * scale)
    bubble2_w = int(240 * scale)
    bubble2_h = int(160 * scale)
    bubble2_r = int(32 * scale)
    
    draw.rounded_rectangle(
        [bubble2_x, bubble2_y, bubble2_x + bubble2_w, bubble2_y + bubble2_h],
        radius=bubble2_r,
        fill=(57, 211, 83, 230)  # #39d353 with opacity
    )
    
    # サイズが大きい場合は詳細を追加
    if size >= 96:
        # ドット（チャットバブル1内）
        dot_y = int(180 * scale)
        dot_size = max(2, int(8 * scale))
        for dot_x in [140, 180, 220]:
            x = int(dot_x * scale)
            draw.ellipse([x-dot_size//2, dot_y-dot_size//2, 
                         x+dot_size//2, dot_y+dot_size//2], 
                        fill=(255, 255, 255, 200))
        
        # テキスト線（チャットバブル2内）
        if size >= 128:
            line_y1 = int(292 * scale)
            line_y2 = int(316 * scale)
            line_h = max(2, int(12 * scale))
            
            # 長い線
            draw.rounded_rectangle(
                [int(232 * scale), line_y1, int(352 * scale), line_y1 + line_h],
                radius=line_h//2,
                fill=(255, 255, 255, 200)
            )
            
            # 短い線
            draw.rounded_rectangle(
                [int(232 * scale), line_y2, int(312 * scale), line_y2 + line_h],
                radius=line_h//2,
                fill=(255, 255, 255, 200)
            )
    
    # 小さな装飾要素（大きいサイズのみ）
    if size >= 192:
        # カーソル
        cursor_x = int(380 * scale)
        cursor_y = int(380 * scale)
        cursor_w = int(20 * scale)
        cursor_h = int(24 * scale)
        
        draw.rectangle([cursor_x, cursor_y, cursor_x + cursor_w, cursor_y + cursor_h],
                      fill=(255, 193, 7, 230))  # #ffc107
    
    # 保存
    img.save(output_path, 'PNG', optimize=True)
    print(f"Generated: {output_path} ({size}x{size})")

def main():
    """メイン処理"""
    # 出力ディレクトリ
    output_dir = "/Users/yuchi/Desktop/miuchi.chat/frontend/public/icons"
    os.makedirs(output_dir, exist_ok=True)
    
    # 生成するサイズ
    sizes = [72, 96, 128, 144, 152, 192, 384, 512]
    
    for size in sizes:
        output_path = os.path.join(output_dir, f"icon-{size}x{size}.png")
        create_icon(size, output_path)
    
    print(f"Generated {len(sizes)} PWA icons successfully!")

if __name__ == "__main__":
    main()