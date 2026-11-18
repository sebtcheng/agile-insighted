#!/usr/bin/env python3
"""
scripts/render_report.py - Validates scores.json, computes totals and grade bands,
and deterministically renders ui-audit-report.md.
"""

import os
import sys
import json
import argparse

def get_grade_band(score):
    if score >= 90.0:
        return "Matches the standard"
    elif score >= 75.0:
        return "Close"
    elif score >= 60.0:
        return "Partial"
    elif score >= 40.0:
        return "Diverges"
    else:
        return "Far from the standard"

def validate_and_render(scores_path, scan_path, out_path, rubric_path):
    # 1. Load Rubric
    if not os.path.exists(rubric_path):
        sys.stderr.write(f"Error: Rubric file not found at '{rubric_path}'.\n")
        sys.exit(1)

    with open(rubric_path, 'r', encoding='utf-8') as f:
        rubric_list = json.load(f)

    rubric_map = {item['id']: item for item in rubric_list}

    # 2. Load Scores
    if not os.path.exists(scores_path):
        sys.stderr.write(f"Error: Scores file not found at '{scores_path}'.\n")
        sys.exit(1)

    with open(scores_path, 'r', encoding='utf-8') as f:
        scores_data = json.load(f)

    # 3. Load optional scan data
    scan_data = {}
    if scan_path and os.path.exists(scan_path):
        try:
            with open(scan_path, 'r', encoding='utf-8') as f:
                scan_data = json.load(f)
        except Exception:
            pass

    # Validation
    errors = []
    seen_ids = set()
    criteria_list = scores_data.get('criteria', [])

    for c in criteria_list:
        cid = c.get('id')
        if not cid:
            errors.append("Criterion entry missing 'id'.")
            continue
        if cid in seen_ids:
            errors.append(f"Duplicate criterion ID '{cid}' in scores.json.")
        seen_ids.add(cid)

        if cid not in rubric_map:
            errors.append(f"Unknown criterion ID '{cid}' not present in rubric.json.")
            continue

        rubric_item = rubric_map[cid]
        c_max = c.get('max')
        if c_max != rubric_item['max']:
            errors.append(f"Criterion '{cid}' max value ({c_max}) does not match rubric max ({rubric_item['max']}).")

        score = c.get('score', 0)
        is_na = c.get('na', False)

        if not isinstance(score, (int, float)):
            errors.append(f"Criterion '{cid}' score must be numeric.")
        else:
            if score < 0 or score > rubric_item['max']:
                errors.append(f"Criterion '{cid}' score ({score}) out of bounds [0, {rubric_item['max']}].")
            if (score * 2) % 1 != 0:
                errors.append(f"Criterion '{cid}' score ({score}) must be a multiple of 0.5.")

        finding = c.get('finding', '').strip()
        evidence = c.get('evidence', [])

        if is_na:
            if not finding:
                errors.append(f"Criterion '{cid}' marked 'na: true' must include a finding explaining why.")
        else:
            if score < rubric_item['max']:
                if not finding:
                    errors.append(f"Criterion '{cid}' score below max requires a non-empty 'finding'.")
                if not evidence or len(evidence) == 0:
                    errors.append(f"Criterion '{cid}' score below max requires at least one 'evidence' entry.")
                rec = c.get('recommendation')
                if not rec or not isinstance(rec, dict):
                    errors.append(f"Criterion '{cid}' score below max requires a 'recommendation' object.")
                else:
                    if rec.get('priority') not in ('P0', 'P1', 'P2'):
                        errors.append(f"Criterion '{cid}' recommendation priority must be 'P0', 'P1', or 'P2'.")
                    if not rec.get('change'):
                        errors.append(f"Criterion '{cid}' recommendation missing 'change' description.")
                    if not rec.get('files') or len(rec.get('files', [])) == 0:
                        errors.append(f"Criterion '{cid}' recommendation must cite at least one file.")
                    if rec.get('effort') not in ('S', 'M', 'L'):
                        errors.append(f"Criterion '{cid}' recommendation effort must be 'S', 'M', or 'L'.")

    # Check for missing rubric items
    missing_ids = set(rubric_map.keys()) - seen_ids
    if missing_ids:
        for mid in sorted(missing_ids):
            errors.append(f"Missing criterion '{mid}' ({rubric_map[mid]['title']}) from scores.json.")

    if not scores_data.get('implementation_prompt'):
        sys.stderr.write("Warning: 'implementation_prompt' is empty in scores.json.\n")

    if errors:
        sys.stderr.write("Validation failed with the following errors:\n")
        for i, err in enumerate(errors, start=1):
            sys.stderr.write(f"  {i}. {err}\n")
        sys.exit(1)

    # Calculation
    category_totals = {}
    total_earned = 0.0
    total_possible = 0.0

    scores_by_id = {c['id']: c for c in criteria_list}

    for item in rubric_list:
        cid = item['id']
        cat = item['category']
        cat_name = item['category_name']
        c_score_obj = scores_by_id[cid]

        if cat not in category_totals:
            category_totals[cat] = {
                "name": cat_name,
                "earned": 0.0,
                "possible": 0.0
            }

        if not c_score_obj.get('na', False):
            sc = float(c_score_obj.get('score', 0))
            mx = float(item['max'])
            category_totals[cat]["earned"] += sc
            category_totals[cat]["possible"] += mx
            total_earned += sc
            total_possible += mx

    final_score = (total_earned / total_possible * 100.0) if total_possible > 0 else 0.0
    final_score = round(final_score, 1)
    grade = get_grade_band(final_score)

    # Identify lowest category
    lowest_cat = None
    lowest_pct = 101.0
    for cat_id, cat_info in category_totals.items():
        if cat_info["possible"] > 0:
            pct = (cat_info["earned"] / cat_info["possible"]) * 100.0
            if pct < lowest_pct:
                lowest_pct = pct
                lowest_cat = cat_info["name"]

    summary_sentence = f"The evaluated repository scores lowest in {lowest_cat} ({round(lowest_pct, 1)}% compliance), which represents the primary area for visual alignment."

    # Render Report Markdown
    lines = []
    lines.append(f"# UI Standard Audit Report: {scores_data.get('repo', 'Audited Repository')}")
    lines.append("")
    lines.append(f"- **Audit Date**: {scores_data.get('audited_at', 'N/A')}")
    lines.append(f"- **Stack**: {scores_data.get('stack', 'Detected Front-End')}")
    lines.append(f"- **Screens in Scope**: {', '.join(scores_data.get('screens_in_scope', ['Main Dashboard']))}")
    lines.append(f"- **Verification Modalities**: {', '.join(scores_data.get('verified_by', ['code']))}")
    lines.append("")

    lines.append("## 1. Result")
    lines.append("")
    lines.append(f"**Total Score: {final_score} / 100** ({grade})")
    lines.append("")
    lines.append(summary_sentence)
    lines.append("")

    lines.append("## 2. Scorecard")
    lines.append("")
    lines.append("### Category Summary")
    lines.append("| Category | Earned / Possible | Percentage |")
    lines.append("|---|---|---|")
    for cat_id in sorted(category_totals.keys()):
        ci = category_totals[cat_id]
        pct = (ci["earned"] / ci["possible"] * 100.0) if ci["possible"] > 0 else 0.0
        lines.append(f"| **{cat_id}. {ci['name']}** | {ci['earned']:g} / {ci['possible']:g} | {pct:.1f}% |")
    lines.append(f"| **Total** | **{total_earned:g} / {total_possible:g}** | **{final_score:.1f}%** |")
    lines.append("")

    lines.append("### Detailed Criteria Breakdown")
    lines.append("| ID | Criterion Title | Score | Max | Status |")
    lines.append("|---|---|---|---|---|")
    for item in rubric_list:
        cid = item['id']
        c_obj = scores_by_id[cid]
        sc = c_obj.get('score', 0)
        mx = item['max']
        if c_obj.get('na', False):
            status_str = "N/A"
        elif sc == mx:
            status_str = "Met"
        elif sc > 0:
            status_str = "Partial"
        else:
            status_str = "Missing"
        lines.append(f"| `{cid}` | {item['title'][:70]}... | {sc:g} | {mx:g} | {status_str} |")
    lines.append("")

    lines.append("## 3. Findings by Category")
    lines.append("")
    for cat_id in sorted(category_totals.keys()):
        cat_items = [item for item in rubric_list if item['category'] == cat_id]
        cat_findings = []
        for it in cat_items:
            cid = it['id']
            c_obj = scores_by_id[cid]
            if c_obj.get('score', 0) < it['max'] or c_obj.get('na', False):
                cat_findings.append((it, c_obj))

        if cat_findings:
            lines.append(f"### Category {cat_id}: {category_totals[cat_id]['name']}")
            lines.append("")
            for it, c_obj in cat_findings:
                sc = c_obj.get('score', 0)
                mx = it['max']
                na_label = " [N/A]" if c_obj.get('na', False) else f" [{sc:g}/{mx:g} pts]"
                lines.append(f"#### `{it['id']}`: {it['title']}{na_label}")
                lines.append(f"- **Finding**: {c_obj.get('finding', 'No finding details provided.')}")
                evidence = c_obj.get('evidence', [])
                if evidence:
                    lines.append("- **Evidence**:")
                    for ev in evidence:
                        lines.append(f"  - `{ev}`")
                lines.append("")

    # Recommendations collection
    all_recs = []
    quick_wins = []
    structural_recs = []

    effort_rank = {'S': 1, 'M': 2, 'L': 3}

    for item in rubric_list:
        cid = item['id']
        c_obj = scores_by_id[cid]
        rec = c_obj.get('recommendation')
        if rec and not c_obj.get('na', False) and c_obj.get('score', 0) < item['max']:
            rec_entry = {
                "cid": cid,
                "priority": rec.get('priority', 'P2'),
                "change": rec.get('change', ''),
                "files": rec.get('files', []),
                "effort": rec.get('effort', 'M'),
                "pts_recoverable": item['max'] - c_obj.get('score', 0),
                "is_structural": c_obj.get('finding', '').startswith('STRUCTURAL')
            }
            if rec_entry["is_structural"]:
                structural_recs.append(rec_entry)
            else:
                all_recs.append(rec_entry)

            if rec_entry["effort"] == 'S' and rec_entry["pts_recoverable"] >= 2.0:
                quick_wins.append(rec_entry)

    # Sort recommendations by points recoverable desc, then effort asc
    def rec_sort_key(r):
        return (-r["pts_recoverable"], effort_rank.get(r["effort"], 2))

    lines.append("## 4. Recommendations")
    lines.append("")
    for p in ['P0', 'P1', 'P2']:
        p_recs = [r for r in all_recs if r['priority'] == p]
        p_recs.sort(key=rec_sort_key)
        lines.append(f"### Priority {p}")
        if not p_recs:
            lines.append(f"No {p} recommendations identified.")
            lines.append("")
            continue
        for r in p_recs:
            lines.append(f"- **[`{r['cid']}`] (+{r['pts_recoverable']:g} pts, Effort: {r['effort']})**: {r['change']}")
            lines.append(f"  - Files: {', '.join('`' + f + '`' for f in r['files'])}")
        lines.append("")

    lines.append("## 5. Quick Wins")
    lines.append("")
    if quick_wins:
        quick_wins.sort(key=rec_sort_key)
        for r in quick_wins:
            lines.append(f"- **[`{r['cid']}`] (+{r['pts_recoverable']:g} pts)**: {r['change']} (Files: {', '.join('`' + f + '`' for f in r['files'])})")
    else:
        lines.append("No isolated small-effort quick wins identified.")
    lines.append("")

    lines.append("## 6. Structural Items")
    lines.append("")
    if structural_recs:
        for r in structural_recs:
            lines.append(f"- **[`{r['cid']}`] ({r['priority']}, Effort: {r['effort']})**: {r['change']} (Files: {', '.join('`' + f + '`' for f in r['files'])})")
    else:
        lines.append("Zero architectural or data-fetching mutations required. All recommendations are presentation-layer.")
    lines.append("")

    lines.append("## 7. Implementation Prompt")
    lines.append("")
    lines.append("```markdown")
    lines.append(scores_data.get('implementation_prompt', 'No prompt configured.'))
    lines.append("```")
    lines.append("")

    lines.append("## 8. Unverified")
    lines.append("")
    unverified = scores_data.get('unverified', [])
    if unverified:
        for u in unverified:
            lines.append(f"- {u}")
    else:
        lines.append("- All standard screens, components, and token layers were verified.")
    lines.append("")

    lines.append("## 9. Appendix: Scanner Metrics")
    lines.append("")
    if scan_data:
        fonts_sum = scan_data.get('fonts', {}).get('summary', {})
        colors_sum = scan_data.get('colors', {}).get('summary', {})
        sizes_sum = scan_data.get('font_sizes', {}).get('summary', {})
        status_sum = scan_data.get('status_mapping', {}).get('summary', {})

        lines.append(f"- **Scanned Files**: {scan_data.get('scanned_files', 0)}")
        lines.append(f"- **Detected Stack**: {scan_data.get('stack', {}).get('summary', 'N/A')}")
        lines.append(f"- **Distinct Font Families**: {', '.join(fonts_sum.get('distinct_families', [])) or 'None detected'}")
        lines.append(f"- **Plus Jakarta Sans Loaded**: {fonts_sum.get('plus_jakarta_loaded', False)}")
        lines.append(f"- **Distinct Colors Found**: {colors_sum.get('distinct_colors_count', 0)}")
        lines.append(f"- **Pure Black Text Usages**: {colors_sum.get('pure_black_text_count', 0)}")
        lines.append(f"- **Font Sizes < 12px**: {sizes_sum.get('sizes_under_12px_count', 0)} (< 11px: {sizes_sum.get('sizes_under_11px_count', 0)})")
        lines.append(f"- **Files Defining Status Colors**: {status_sum.get('files_defining_status_colors_count', 0)}")
    else:
        lines.append("- No raw `scan.json` data was supplied to render appendix metrics.")
    lines.append("")

    out_dir = os.path.dirname(os.path.abspath(out_path))
    os.makedirs(out_dir, exist_ok=True)

    with open(out_path, 'w', encoding='utf-8') as f:
        f.write("\n".join(lines))

    print(f"Report rendered successfully: {out_path} (Score: {final_score}, Grade: {grade})")

def main():
    parser = argparse.ArgumentParser(description="Render UI Audit Report from scores.json and rubric.json")
    parser.add_argument("--scores", required=True, help="Path to scores.json")
    parser.add_argument("--scan", help="Path to optional scan.json for appendix metrics")
    parser.add_argument("--out", required=True, help="Path to write ui-audit-report.md")
    parser.add_argument("--rubric", help="Path to rubric.json (default: ../reference/rubric.json)")

    args = parser.parse_args()

    default_rubric = os.path.join(os.path.dirname(__file__), '..', 'reference', 'rubric.json')
    rubric_path = os.path.abspath(args.rubric) if args.rubric else os.path.abspath(default_rubric)

    validate_and_render(args.scores, args.scan, args.out, rubric_path)

if __name__ == '__main__':
    main()
