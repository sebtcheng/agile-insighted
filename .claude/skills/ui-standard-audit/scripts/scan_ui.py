#!/usr/bin/env python3
"""
scripts/scan_ui.py - Deterministic static scanner for front-end repositories.
Extracts measurable design signals against the InsightED Schools Review standard.
Outputs deterministic JSON evidence.
"""

import os
import sys
import json
import re
import math
import argparse
from collections import Counter

EXTENSIONS = {'.tsx', '.jsx', '.ts', '.js', '.css', '.scss', '.sass', '.less', '.html', '.vue', '.svelte'}
IGNORE_DIRS = {
    'node_modules', '.git', 'dist', 'build', '.next', 'out',
    'coverage', '.turbo', 'vendor', 'ui-audit'
}
MAX_FILE_SIZE = 1024 * 1024  # 1 MB

STANDARD_PALETTE_HEX = {
    'brand_navy': '#0F4C8A',
    'accent_red': '#D4182F',
    'accent_yellow': '#FFC629',
    'bg_tint': '#E8EFF7',
    'heading_navy': '#0B2A4A',
    'status_green': '#10B981',
    'status_gray': '#94A3B8'
}

def hex_to_rgb(hex_str):
    hex_str = hex_str.lstrip('#')
    if len(hex_str) == 3:
        hex_str = ''.join(c * 2 for c in hex_str)
    elif len(hex_str) == 8:
        hex_str = hex_str[:6]
    if len(hex_str) != 6:
        return None
    try:
        return tuple(int(hex_str[i:i+2], 16) for i in (0, 2, 4))
    except ValueError:
        return None

def rgb_distance(c1, c2):
    return math.sqrt(sum((a - b) ** 2 for a, b in zip(c1, c2)))

def is_near_standard_palette(rgb):
    for name, hex_val in STANDARD_PALETTE_HEX.items():
        std_rgb = hex_to_rgb(hex_val)
        if std_rgb and rgb_distance(rgb, std_rgb) <= 30.0:
            return True, name
    return False, None

def rgb_to_hsl(r, g, b):
    r_norm, g_norm, b_norm = r / 255.0, g / 255.0, b / 255.0
    cmax = max(r_norm, g_norm, b_norm)
    cmin = min(r_norm, g_norm, b_norm)
    delta = cmax - cmin

    if delta == 0:
        h = 0
    elif cmax == r_norm:
        h = (60 * ((g_norm - b_norm) / delta) + 360) % 360
    elif cmax == g_norm:
        h = (60 * ((b_norm - r_norm) / delta) + 120) % 360
    else:
        h = (60 * ((r_norm - g_norm) / delta) + 240) % 360

    l = (cmax + cmin) / 2.0
    s = 0 if delta == 0 else delta / (1 - abs(2 * l - 1))
    return h, s * 100, l * 100

def is_off_palette_brown_orange(rgb):
    h, s, l = rgb_to_hsl(*rgb)
    return 15 <= h <= 40 and s > 50 and 20 <= l <= 80

def clean_rel_path(p, base):
    rel = os.path.relpath(p, base)
    return rel.replace('\\', '/')

def scan_repo(repo_path, max_evidence=20):
    repo_path = os.path.abspath(repo_path)
    if not os.path.exists(repo_path) or not os.path.isdir(repo_path):
        sys.stderr.write(f"Error: Target path '{repo_path}' is not a valid directory.\n")
        sys.exit(2)

    package_json_path = os.path.join(repo_path, 'package.json')
    package_data = {}
    if os.path.exists(package_json_path):
        try:
            with open(package_json_path, 'r', encoding='utf-8', errors='ignore') as f:
                package_data = json.load(f)
        except Exception:
            pass

    # Stack detection
    deps = {}
    deps.update(package_data.get('dependencies', {}))
    deps.update(package_data.get('devDependencies', {}))

    stack_items = []
    if any('@mantine' in k for k in deps):
        v = deps.get('@mantine/core', 'detected')
        stack_items.append(f"Mantine ({v})")
    if 'tailwindcss' in deps or any('tailwind' in k for k in deps):
        stack_items.append(f"Tailwind CSS ({deps.get('tailwindcss', 'detected')})")
    if '@mui/material' in deps or '@material-ui/core' in deps:
        stack_items.append("MUI (Material UI)")
    if '@chakra-ui/react' in deps:
        stack_items.append("Chakra UI")
    if 'antd' in deps:
        stack_items.append("Ant Design")
    if 'bootstrap' in deps or 'react-bootstrap' in deps:
        stack_items.append("Bootstrap")
    if 'styled-components' in deps:
        stack_items.append("styled-components")
    if '@emotion/react' in deps:
        stack_items.append("Emotion")
    if 'mantine-react-table' in deps:
        stack_items.append("mantine-react-table")
    if 'mantine-datatable' in deps:
        stack_items.append("mantine-datatable")
    if '@tanstack/react-table' in deps or 'react-table' in deps:
        stack_items.append("TanStack Table")
    if 'recharts' in deps:
        stack_items.append("Recharts")
    if 'chart.js' in deps or 'react-chartjs-2' in deps:
        stack_items.append("Chart.js")
    fontsource_pkgs = [k for k in deps if k.startswith('@fontsource/')]
    if fontsource_pkgs:
        stack_items.append(f"Fontsource ({', '.join(fontsource_pkgs)})")

    stack_summary = ", ".join(stack_items) if stack_items else "Standard Front-End (CSS/Vanilla React)"

    # Walk files
    scanned_files = 0
    skipped_files = 0
    target_files = []

    for root, dirs, files in os.walk(repo_path):
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]
        for f in sorted(files):
            ext = os.path.splitext(f)[1].lower()
            if ext in EXTENSIONS:
                full_path = os.path.join(root, f)
                try:
                    size = os.path.getsize(full_path)
                    if size > MAX_FILE_SIZE:
                        skipped_files += 1
                        continue
                    target_files.append(full_path)
                    scanned_files += 1
                except OSError:
                    skipped_files += 1

    target_files.sort()

    # Evidence collector dictionaries
    font_families = Counter()
    font_evidence = []
    plus_jakarta_loaded = False
    plus_jakarta_mentions = 0
    serif_families = set()
    mono_in_input_evidence = []

    font_sizes = Counter()
    sizes_under_12_evidence = []
    sizes_under_11_evidence = []

    colors_counter = Counter()
    colors_evidence = []
    colors_near_std = Counter()
    black_text_evidence = []
    off_palette_brown_evidence = []
    colors_in_components = 0
    colors_in_themes = 0

    radius_counter = Counter()
    radius_under_8_evidence = []
    shadow_count = 0
    card_count = 0
    paper_count = 0
    with_border_count = 0

    status_files_mapping = {}

    table_files = set()
    table_keywords = Counter()

    chart_components = Counter()
    tabular_nums_evidence = []

    a11y_unlabeled_icons = []
    a11y_imgs_without_alt = []
    a11y_outline_none = []
    a11y_focus_visible_count = 0
    a11y_skeleton_count = 0
    a11y_empty_state_count = 0

    breakpoints_found = Counter()
    screens_list = []

    # Regex patterns
    HEX_REGEX = re.compile(r'#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b')
    RGB_REGEX = re.compile(r'rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)')
    FONT_FAMILY_REGEX = re.compile(r'(?:font-family|fontFamily)\s*:\s*([^;,\}\n]+)', re.IGNORECASE)
    FONT_SIZE_REGEX = re.compile(r'(?:font-size|fontSize)\s*:\s*([\'"]?)([\d\.]+(?:px|rem))(?:\1)', re.IGNORECASE)
    MANTINE_SIZE_REGEX = re.compile(r'\bsize\s*=\s*[\'"]([\d\.]+(?:px|rem))[\'"]', re.IGNORECASE)
    BORDER_RADIUS_REGEX = re.compile(r'(?:border-radius|borderRadius)\s*:\s*([^;,\}\n]+)', re.IGNORECASE)
    MANTINE_RADIUS_REGEX = re.compile(r'\bradius\s*=\s*[\'"]?([a-zA-Z0-9_\-\.]+)[\'"]?', re.IGNORECASE)

    STATUS_WORDS_REGEX = re.compile(r'\b(submitted|for revision|not yet submitted|pending|approved|rejected|draft|overdue)\b', re.IGNORECASE)
    COLOR_INDICATOR_REGEX = re.compile(r'(#[0-9a-fA-F]{3,8}|rgba?\(|green|yellow|red|gray|amber|emerald|slate)', re.IGNORECASE)

    # Inspect package.json and HTML for font imports
    for tf in target_files:
        rel_path = clean_rel_path(tf, repo_path)
        is_theme_or_token = bool(re.search(r'(theme|token|tokens|palette|color)', rel_path, re.IGNORECASE))
        is_screen_file = bool(re.search(r'(page|screen|view|route|dashboard|tab)', rel_path, re.IGNORECASE))
        if is_screen_file and rel_path.endswith(('.tsx', '.jsx', '.vue', '.svelte')):
            if rel_path not in screens_list:
                screens_list.append(rel_path)

        file_has_input_or_filter = False
        file_has_mono = False

        try:
            with open(tf, 'r', encoding='utf-8', errors='ignore') as f:
                lines = f.readlines()
        except Exception:
            skipped_files += 1
            continue

        for i, raw_line in enumerate(lines, start=1):
            line = raw_line.strip()
            if not line:
                continue

            # Check font loading
            if '@fontsource/plus-jakarta-sans' in line or 'family=Plus+Jakarta+Sans' in line:
                plus_jakarta_loaded = True
            if 'Plus Jakarta Sans' in line:
                plus_jakarta_mentions += 1

            # Font family matches
            for m in FONT_FAMILY_REGEX.finditer(line):
                val = m.group(1).strip().strip('\'"')
                font_families[val] += 1
                if any(s in val.lower() for s in ['serif', 'merriweather', 'georgia', 'source serif', 'playfair']):
                    serif_families.add(val)
                if 'mono' in val.lower():
                    file_has_mono = True
                if len(font_evidence) < max_evidence:
                    font_evidence.append({
                        "path": rel_path,
                        "line": i,
                        "text": line[:120]
                    })

            # Check inputs/filters
            if re.search(r'\b(input|select|filter|combobox|textfield)\b', line, re.IGNORECASE):
                file_has_input_or_filter = True

            # Font sizes
            for m in FONT_SIZE_REGEX.finditer(line):
                val = m.group(2)
                font_sizes[val] += 1
                px_val = None
                if val.endswith('px'):
                    try: px_val = float(val[:-2])
                    except ValueError: pass
                elif val.endswith('rem'):
                    try: px_val = float(val[:-3]) * 16.0
                    except ValueError: pass

                if px_val is not None:
                    if px_val < 11.0:
                        if len(sizes_under_11_evidence) < max_evidence:
                            sizes_under_11_evidence.append({"path": rel_path, "line": i, "text": line[:120]})
                    elif px_val < 12.0:
                        if len(sizes_under_12_evidence) < max_evidence:
                            sizes_under_12_evidence.append({"path": rel_path, "line": i, "text": line[:120]})

            # Colors - Hex
            for h in HEX_REGEX.findall(line):
                colors_counter[h.upper()] += 1
                if is_theme_or_token:
                    colors_in_themes += 1
                else:
                    colors_in_components += 1

                rgb = hex_to_rgb(h)
                if rgb:
                    near, name = is_near_standard_palette(rgb)
                    if near:
                        colors_near_std[name] += 1
                    if is_off_palette_brown_orange(rgb):
                        if len(off_palette_brown_evidence) < max_evidence:
                            off_palette_brown_evidence.append({"path": rel_path, "line": i, "text": line[:120]})

                # Pure black check
                if h.upper() in ('#000', '#000000', '#000000FF') and ('color' in line.lower() or 'text' in line.lower()):
                    if len(black_text_evidence) < max_evidence:
                        black_text_evidence.append({"path": rel_path, "line": i, "text": line[:120]})

                if len(colors_evidence) < max_evidence:
                    colors_evidence.append({"path": rel_path, "line": i, "text": line[:120]})

            # Color - RGB
            for m in RGB_REGEX.finditer(line):
                try:
                    rgb = (int(m.group(1)), int(m.group(2)), int(m.group(3)))
                    if rgb == (0, 0, 0) and ('color' in line.lower() or 'text' in line.lower()):
                        if len(black_text_evidence) < max_evidence:
                            black_text_evidence.append({"path": rel_path, "line": i, "text": line[:120]})
                    near, name = is_near_standard_palette(rgb)
                    if near:
                        colors_near_std[name] += 1
                except Exception:
                    pass

            # Border radius & shadow
            for m in BORDER_RADIUS_REGEX.finditer(line):
                val = m.group(1).strip()
                radius_counter[val] += 1
                m_px = re.search(r'(\d+)px', val)
                if m_px and int(m_px.group(1)) < 8 and int(m_px.group(1)) > 0:
                    if len(radius_under_8_evidence) < max_evidence:
                        radius_under_8_evidence.append({"path": rel_path, "line": i, "text": line[:120]})

            for m in MANTINE_RADIUS_REGEX.finditer(line):
                radius_counter[m.group(1)] += 1

            if 'box-shadow' in line or 'boxShadow' in line or 'shadow=' in line:
                shadow_count += 1
            if '<Card' in line or 'Card.' in line:
                card_count += 1
            if '<Paper' in line or 'Paper.' in line:
                paper_count += 1
            if 'withBorder' in line:
                with_border_count += 1

            # Status mapping check
            if STATUS_WORDS_REGEX.search(line) and COLOR_INDICATOR_REGEX.search(line):
                if rel_path not in status_files_mapping:
                    status_files_mapping[rel_path] = []
                if len(status_files_mapping[rel_path]) < 5:
                    status_files_mapping[rel_path].append({"line": i, "text": line[:120]})

            # Table keywords
            if any(k in line for k in ['<table', '<Table', 'mantine-react-table', 'DataTable', 'getPaginationRowModel', 'columns={']):
                table_files.add(rel_path)
            for kw in ['sortable', 'sorting', 'accessor', 'filter', 'stickyHeader', 'Pagination', 'recordsPerPage', 'tabular-nums', 'tnum']:
                if kw in line:
                    table_keywords[kw] += 1

            # Charts and KPIs
            for chart_comp in ['RingProgress', 'DonutChart', 'PieChart', 'Doughnut', 'Progress', 'Progress.Section', 'StatCard', 'KpiCard', 'Stat']:
                if chart_comp in line:
                    chart_components[chart_comp] += 1

            if 'tabular-nums' in line or 'font-variant-numeric' in line:
                if len(tabular_nums_evidence) < max_evidence:
                    tabular_nums_evidence.append({"path": rel_path, "line": i, "text": line[:120]})

            # Accessibility
            if re.search(r'<(?:ActionIcon|IconButton)[^>]*>', line) and 'aria-label' not in line:
                if len(a11y_unlabeled_icons) < max_evidence:
                    a11y_unlabeled_icons.append({"path": rel_path, "line": i, "text": line[:120]})
            if '<img' in line and 'alt=' not in line:
                if len(a11y_imgs_without_alt) < max_evidence:
                    a11y_imgs_without_alt.append({"path": rel_path, "line": i, "text": line[:120]})
            if re.search(r'outline\s*:\s*(?:none|0)\b', line) and ':focus-visible' not in line:
                if len(a11y_outline_none) < max_evidence:
                    a11y_outline_none.append({"path": rel_path, "line": i, "text": line[:120]})
            if ':focus-visible' in line:
                a11y_focus_visible_count += 1
            if 'Skeleton' in line:
                a11y_skeleton_count += 1
            if re.search(r'\b(EmptyState|empty_state|NoData|no-data)\b', line, re.IGNORECASE):
                a11y_empty_state_count += 1

            # Responsive breakpoints
            for bp in ['1366', '1280', '1024', '768', '640', 'sm', 'md', 'lg', 'xl']:
                if re.search(r'[@"\']' + bp, line):
                    breakpoints_found[bp] += 1

        if file_has_mono and file_has_input_or_filter:
            if len(mono_in_input_evidence) < max_evidence:
                mono_in_input_evidence.append({"path": rel_path, "line": 1, "text": "File contains both monospace font declarations and input/filter controls."})

    # Top colors
    top_colors = [{"color": c, "count": cnt} for c, cnt in colors_counter.most_common(15)]

    # Status mapping evidence
    status_evidence = []
    for fpath, items in sorted(status_files_mapping.items()):
        for it in items:
            status_evidence.append({
                "path": fpath,
                "line": it["line"],
                "text": it["text"]
            })
            if len(status_evidence) >= max_evidence:
                break
        if len(status_evidence) >= max_evidence:
            break

    result = {
        "repo": clean_rel_path(repo_path, repo_path) or os.path.basename(repo_path),
        "scanned_files": scanned_files,
        "skipped_files": skipped_files,
        "stack": {
            "summary": stack_summary,
            "detected_libraries": sorted(stack_items),
            "total_dependencies": len(deps)
        },
        "fonts": {
            "summary": {
                "plus_jakarta_loaded": plus_jakarta_loaded,
                "plus_jakarta_mentions": plus_jakarta_mentions,
                "distinct_families": sorted(list(font_families.keys())),
                "serif_families": sorted(list(serif_families)),
                "files_with_mono_and_inputs": len(mono_in_input_evidence)
            },
            "evidence": font_evidence[:max_evidence],
            "mono_in_inputs_evidence": mono_in_input_evidence[:max_evidence]
        },
        "font_sizes": {
            "summary": {
                "total_sizes_found": sum(font_sizes.values()),
                "sizes_under_12px_count": len(sizes_under_12_evidence),
                "sizes_under_11px_count": len(sizes_under_11_evidence),
                "top_sizes": [{"size": s, "count": c} for s, c in font_sizes.most_common(10)]
            },
            "evidence_under_12px": sizes_under_12_evidence[:max_evidence],
            "evidence_under_11px": sizes_under_11_evidence[:max_evidence]
        },
        "colors": {
            "summary": {
                "distinct_colors_count": len(colors_counter),
                "top_colors": top_colors,
                "near_standard_palette_matches": dict(colors_near_std),
                "colors_in_components": colors_in_components,
                "colors_in_themes_or_tokens": colors_in_themes,
                "pure_black_text_count": len(black_text_evidence),
                "off_palette_brown_orange_count": len(off_palette_brown_evidence)
            },
            "black_text_evidence": black_text_evidence[:max_evidence],
            "off_palette_evidence": off_palette_brown_evidence[:max_evidence],
            "general_evidence": colors_evidence[:max_evidence]
        },
        "radius_shadow_border": {
            "summary": {
                "cards_detected": card_count,
                "paper_detected": paper_count,
                "with_border_count": with_border_count,
                "shadow_declarations": shadow_count,
                "radius_under_8px_count": len(radius_under_8_evidence),
                "top_radius_values": [{"radius": r, "count": c} for r, c in radius_counter.most_common(8)]
            },
            "radius_under_8px_evidence": radius_under_8_evidence[:max_evidence]
        },
        "status_mapping": {
            "summary": {
                "files_defining_status_colors_count": len(status_files_mapping),
                "files_list": sorted(list(status_files_mapping.keys()))
            },
            "evidence": status_evidence[:max_evidence]
        },
        "tables": {
            "summary": {
                "table_files_count": len(table_files),
                "table_files": sorted(list(table_files)),
                "feature_keywords": dict(table_keywords)
            }
        },
        "kpi_and_charts": {
            "summary": {
                "chart_and_kpi_components": dict(chart_components),
                "tabular_nums_declarations": len(tabular_nums_evidence)
            },
            "tabular_nums_evidence": tabular_nums_evidence[:max_evidence]
        },
        "a11y": {
            "summary": {
                "unlabeled_icon_buttons": len(a11y_unlabeled_icons),
                "images_without_alt": len(a11y_imgs_without_alt),
                "outline_none_without_focus": len(a11y_outline_none),
                "focus_visible_declarations": a11y_focus_visible_count,
                "skeleton_loading_states": a11y_skeleton_count,
                "empty_state_components": a11y_empty_state_count
            },
            "unlabeled_icons_evidence": a11y_unlabeled_icons[:max_evidence],
            "outline_none_evidence": a11y_outline_none[:max_evidence]
        },
        "responsive": {
            "summary": {
                "breakpoints_used": dict(breakpoints_found),
                "has_1366_target": breakpoints_found.get('1366', 0) > 0 or breakpoints_found.get('xl', 0) > 0
            }
        },
        "screens": {
            "candidate_screens": sorted(screens_list)
        }
    }

    return result

def main():
    parser = argparse.ArgumentParser(description="Deterministic UI scanner for InsightED design standard")
    parser.add_argument("repo_path", help="Path to front-end repository root")
    parser.add_argument("--out", required=True, help="Path to write scan.json output")
    parser.add_argument("--max-evidence", type=int, default=20, help="Max evidence lines per check (default: 20)")

    args = parser.parse_args()
    data = scan_repo(args.repo_path, max_evidence=args.max_evidence)

    out_path = os.path.abspath(args.out)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, sort_keys=True)

    print(f"Scan complete: {data['scanned_files']} files scanned. Output written to {out_path}")

if __name__ == '__main__':
    main()
