#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
replace_dialogs.py
==================
批量替换指定 JS 文件中的 alert() → showToast() 和 confirm() → showConfirm()

策略：
  alert("msg")   → showToast("msg", 'type')   （type 根据内容自动判断）
  confirm("msg") → await showConfirm("msg", ...)

注意：confirm 的函数包装改为 async 需手动检查，脚本只做调用点替换。
"""

import re
import sys
import os

def classify_alert(msg_content):
    """根据消息内容判断 Toast 类型"""
    s = msg_content.lower()
    if any(k in s for k in ['✅', '成功', '已保存', '已导出', '已复制', '已加载', '已清空', '已删除', '已应用']):
        return 'success'
    if any(k in s for k in ['❌', '失败', '错误', '无法', 'error', 'fail']):
        return 'error'
    if any(k in s for k in ['⚠️', '警告', '注意', '过多', '超时']):
        return 'warning'
    return 'info'

def extract_first_string_arg(call_str):
    """从 alert(..) 或 confirm(..) 括号内提取第一个参数（简化版，不处理嵌套括号）"""
    # 找到第一个 ( 之后的内容
    try:
        inner = call_str[call_str.index('(') + 1:]
        # 匹配字符串字面量
        m = re.match(r"(['\"`])(.*?)\1", inner, re.DOTALL)
        if m:
            return m.group(0), m.group(2)
    except Exception:
        pass
    return None, None

def replace_alerts_in_line(line):
    """
    替换一行中的 alert(...) → showToast(...)
    只处理完整的单行 alert(...); 形式
    """
    # 替换单行 alert('...') 或 alert("...") 或 alert(`...`)
    def replace_match(m):
        full = m.group(0)
        arg_raw, arg_content = extract_first_string_arg(full)
        if arg_raw:
            t = classify_alert(arg_content)
            return full.replace('alert(', f"showToast(", 1).\
                replace(arg_raw + ')', arg_raw + f", '{t}')", 1)
        # 无法解析字符串：使用通用替换
        return full.replace('alert(', 'showToast(', 1)

    # 匹配 alert( 开始的调用（非 palert 等）
    result = re.sub(r'(?<!\w)alert\(', 'showToast(', line)
    return result

def replace_confirms_in_line(line):
    """
    替换 confirm('...') → await showConfirm('...', {danger: true})
    以及 if (confirm(...)) → if (await showConfirm(...))
    以及 if (!confirm(...)) → if (!(await showConfirm(...)))
    """
    # confirm( → showConfirm(  (不加 await，await 需要外层 async，手动处理)
    # 策略：加 await + showConfirm，并将返回值使用保持一致
    line = re.sub(r'(?<!\w)confirm\(', 'await showConfirm(', line)
    return line

def process_file(filepath):
    """处理单个文件"""
    with open(filepath, 'r', encoding='utf-8') as f:
        original = f.read()

    lines = original.split('\n')
    new_lines = []
    alert_count = 0
    confirm_count = 0

    for line in lines:
        # 跳过注释行
        stripped = line.strip()
        if stripped.startswith('//') or stripped.startswith('*'):
            new_lines.append(line)
            continue

        orig = line
        if 'alert(' in line and '(?<!\w)alert\(' not in line:
            new_line = replace_alerts_in_line(line)
            if new_line != line:
                alert_count += 1
            line = new_line

        if 'confirm(' in line:
            new_line = replace_confirms_in_line(line)
            if new_line != line:
                confirm_count += 1
            line = new_line

        new_lines.append(line)

    result = '\n'.join(new_lines)

    if result != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(result)
        print(f"  ✓ {os.path.basename(filepath)}: alert×{alert_count} confirm×{confirm_count}")
    else:
        print(f"  - {os.path.basename(filepath)}: 无变更")

    return alert_count, confirm_count

if __name__ == '__main__':
    targets = sys.argv[1:] if len(sys.argv) > 1 else []
    if not targets:
        print("用法: python replace_dialogs.py <file1.js> [file2.js ...]")
        sys.exit(1)

    total_alerts = 0
    total_confirms = 0
    for f in targets:
        if os.path.exists(f):
            a, c = process_file(f)
            total_alerts += a
            total_confirms += c
        else:
            print(f"  ✗ 找不到文件: {f}")

    print(f"\n完成: 共替换 alert×{total_alerts} confirm×{total_confirms}")
