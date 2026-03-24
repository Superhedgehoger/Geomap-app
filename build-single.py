#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
GeoMap 单文件构建脚本
======================
将所有 JS/CSS 合并内联到一个自包含 HTML 文件中。

使用方法:
    # 生成空白版（无数据，可在浏览器中正常使用）
    python build-single.py

    # 生成含数据版（嵌入指定 GeoJSON，打开即显示标记）
    python build-single.py --with-data example.geojson

    # 指定自定义输出文件名
    python build-single.py --with-data my_data.geojson --output 我的地图.html

输出:
    地图编辑器-空白版.html      （默认，无数据）
    地图编辑器-数据版.html      （含 GeoJSON 数据）
"""

import os
import re
import sys
import json
import argparse
from datetime import datetime

# ── 配置 ────────────────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

HTML_TEMPLATE = 'index.html'

CSS_FILES = [
    'style.css',
    'table-view-styles.css',
]

# JS 文件按依赖顺序排列
JS_FILES = [
    'marker-group.js',
    'selection-manager.js',
    'layer-stats.js',
    'custom-group-manager.js',
    'timeline-manager.js',
    'dashboard-panel.js',
    'script.js',
    'property-editor.js',
    'table-view.js',
]

# ── 工具函数 ─────────────────────────────────────────────────────────────────
def read_file(filepath):
    """读取 UTF-8 文件内容"""
    with open(filepath, 'r', encoding='utf-8') as f:
        return f.read()

def combine_css():
    """合并所有 CSS 文件"""
    combined = []
    for css_file in CSS_FILES:
        filepath = os.path.join(BASE_DIR, css_file)
        if os.path.exists(filepath):
            content = read_file(filepath)
            combined.append(f'/* === {css_file} === */\n{content}')
            print(f'  ✓ CSS: {css_file}')
        else:
            print(f'  ✗ 文件不存在: {css_file}')
    return '\n\n'.join(combined)

def combine_js():
    """合并所有 JS 文件"""
    combined = []
    for js_file in JS_FILES:
        filepath = os.path.join(BASE_DIR, js_file)
        if os.path.exists(filepath):
            content = read_file(filepath)
            combined.append(f'\n// ========== {js_file} ==========\n{content}')
            print(f'  ✓ JS:  {js_file}')
        else:
            print(f'  ✗ 文件不存在: {js_file}')
    return '\n'.join(combined)

def make_data_injection(geojson_path):
    """
    读取 GeoJSON 文件，返回注入脚本块。
    数据挂载到 window.__PRELOADED_DATA__，应用启动时自动读取。
    """
    with open(geojson_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # 写入时间戳，方便追踪
    meta = {
        'source': os.path.basename(geojson_path),
        'exportedAt': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'featureCount': len(data.get('features', []))
    }

    json_str = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    meta_str = json.dumps(meta, ensure_ascii=False)

    return (
        f'<script>\n'
        f'// ── 预载数据（由 build-single.py 嵌入）─────────────────────────\n'
        f'window.__PRELOADED_DATA__ = {json_str};\n'
        f'window.__PRELOADED_META__ = {meta_str};\n'
        f'// ─────────────────────────────────────────────────────────────\n'
        f'</script>\n'
    )

# ── 核心构建 ─────────────────────────────────────────────────────────────────
def build_single_html(geojson_path=None, output_name=None):
    """构建单文件 HTML"""
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M')
    print(f'\nGeoMap 单文件构建 [{timestamp}]\n{"─" * 40}')

    # 确定输出文件名
    if output_name:
        out_filename = output_name
    elif geojson_path:
        out_filename = '地图编辑器-数据版.html'
    else:
        out_filename = '地图编辑器-空白版.html'

    # 读取 HTML 模板
    html_path = os.path.join(BASE_DIR, HTML_TEMPLATE)
    if not os.path.exists(html_path):
        print(f'✗ 找不到模板文件: {html_path}')
        sys.exit(1)
    html = read_file(html_path)

    # 合并 CSS
    print('\n合并 CSS...')
    combined_css = combine_css()

    # 合并 JS
    print('\n合并 JS...')
    combined_js = combine_js()

    # 移除本地 CSS link 标签，内联样式
    for css_file in CSS_FILES:
        html = re.sub(
            rf'<link\s+rel="stylesheet"\s+href="{re.escape(css_file)}"\s*/?>',
            '',
            html
        )
    css_block = f'<style>\n{combined_css}\n</style>\n</head>'
    html = html.replace('</head>', css_block)

    # 移除本地 JS script 标签
    for js_file in JS_FILES:
        html = re.sub(
            rf'<script\s+src="{re.escape(js_file)}"\s*>\s*</script>',
            '',
            html
        )

    # 如果有预载数据，在 </head> 前（即 CSS 之前）注入
    if geojson_path:
        print(f'\n嵌入数据: {geojson_path}')
        injection = make_data_injection(geojson_path)
        # 在 <body> 之后立刻注入，确保在所有 JS 之前执行
        html = html.replace('<body>', f'<body>\n{injection}', 1)
        feature_count = injection.count('"type":"Feature"')
        print(f'  ✓ 已嵌入数据（约 {feature_count} 个要素）')

    # 在 </body> 前插入合并 JS
    js_block = f'<script>\n{combined_js}\n</script>\n</body>'
    html = html.replace('</body>', js_block)

    # 写出文件
    output_path = os.path.join(BASE_DIR, out_filename)
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html)

    size_kb = os.path.getsize(output_path) / 1024
    print(f'\n{"─" * 40}')
    print(f'✅ 构建完成!')
    print(f'   文件: {out_filename}')
    print(f'   大小: {size_kb:.1f} KB')
    print(f'   路径: {output_path}')
    if geojson_path:
        print(f'   数据: {os.path.basename(geojson_path)}')
    print()

# ── 入口 ─────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    parser = argparse.ArgumentParser(
        description='GeoMap 单文件构建工具',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  python build-single.py                              # 生成空白版
  python build-single.py --with-data data.geojson    # 生成含数据版
  python build-single.py --with-data data.geojson --output 青岛地图.html
        """
    )
    parser.add_argument(
        '--with-data', '-d',
        metavar='GEOJSON_FILE',
        help='嵌入指定 GeoJSON 文件的数据'
    )
    parser.add_argument(
        '--output', '-o',
        metavar='OUTPUT_FILE',
        help='自定义输出文件名（默认根据是否含数据自动命名）'
    )
    args = parser.parse_args()

    geojson = None
    if args.with_data:
        geojson = os.path.join(BASE_DIR, args.with_data) if not os.path.isabs(args.with_data) else args.with_data
        if not os.path.exists(geojson):
            print(f'✗ GeoJSON 文件不存在: {geojson}')
            sys.exit(1)

    build_single_html(geojson_path=geojson, output_name=args.output)
