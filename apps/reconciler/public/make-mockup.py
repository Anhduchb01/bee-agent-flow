#!/usr/bin/env python3
"""Sinh mockup dashboard TỪ file thật, để CSS và logic render không thể lệch."""
import re, pathlib, json

HERE = pathlib.Path(__file__).resolve().parent
SRC  = HERE / "index.html"
OUT  = HERE.parents[2] / "docs" / "mockups" / "dashboard.html"
src = SRC.read_text(encoding="utf-8")

css   = re.search(r"<style>(.*?)</style>", src, re.S).group(1)
body  = re.search(r"<body>\s*(.*?)\s*<script>", src, re.S).group(1)
js    = re.search(r"<script>\s*(.*?)\s*</script>", src, re.S).group(1)

# Bỏ phần bootstrap (fetch + setInterval) — mockup nạp fixture thay vì gọi mạng.
js = js.split("function tick()")[0].rstrip()

NOW = "2026-08-12T09:14:03Z"

def ago(sec):
    return f"__AGO_{sec}__"          # thay bằng mốc thời gian thật lúc chạy

fixtures = {
"binh-thuong": {
  "label": "Bình thường",
  "note": "Một task đang chạy, một repo có hàng đợi. Đây là cảnh 90% thời gian.",
  "data": {
    "heartbeat": ago(11), "mode": "running",
    "slots": {"build": {"used": 1, "max": 3, "per_repo_max": 2},
              "evidence": {"used": 0, "max": 1}},
    "running": [{"id": "myapp-42", "repo": "myapp", "number": 42, "rule": "07-build",
                 "pool": "build", "started_at": NOW, "elapsed_s": 712}],
    "repos": [
      {"slug": "myapp", "full": "org/myapp", "enabled": True, "paused": False,
       "running": 1, "wip": {"max": 3},
       "queue": [{"repo": "myapp", "number": 44, "rule": "07-build",
                  "title": "Export danh sách ra CSV",
                  "wait_reason": "xếp sau task khác"}],
       "recent": [
         {"id": "myapp-39", "repo": "myapp", "number": 39, "rule": "04-evidence",
          "result": "ok", "turns": 12, "duration_s": 403, "at": NOW},
         {"id": "myapp-38", "repo": "myapp", "number": 38, "rule": "03-run-ci",
          "result": "ok", "turns": 0, "duration_s": 74, "at": NOW}]},
      {"slug": "shop", "full": "org/shop", "enabled": True, "paused": False,
       "running": 0, "wip": {"max": 3}, "queue": [],
       "recent": [{"id": "shop-12", "repo": "shop", "number": 12, "rule": "08-spec",
                   "result": "ok", "turns": 7, "duration_s": 121, "at": NOW}]}]}},

"day-tai": {
  "label": "Đầy tải",
  "note": "Cả hai bể đều đầy. Mỗi item trong hàng đợi phải tự trả lời "
          "“sao task của tôi chưa chạy?” — đây là trường đáng giá nhất của trang.",
  "data": {
    "heartbeat": ago(4), "mode": "running",
    "slots": {"build": {"used": 3, "max": 3, "per_repo_max": 2},
              "evidence": {"used": 1, "max": 1}},
    "running": [
      {"id": "myapp-42", "repo": "myapp", "number": 42, "rule": "07-build",
       "pool": "build", "started_at": NOW, "elapsed_s": 1844},
      {"id": "myapp-51", "repo": "myapp", "number": 51, "rule": "02-review-feedback",
       "pool": "build", "started_at": NOW, "elapsed_s": 233},
      {"id": "shop-33", "repo": "shop", "number": 33, "rule": "07-build",
       "pool": "build", "started_at": NOW, "elapsed_s": 96},
      {"id": "shop-30", "repo": "shop", "number": 30, "rule": "04-evidence",
       "pool": "evidence", "started_at": NOW, "elapsed_s": 618}],
    "repos": [
      {"slug": "blog", "full": "org/blog", "enabled": True, "paused": False,
       "running": 0, "wip": {"max": 3},
       "queue": [{"repo": "blog", "number": 8, "rule": "08-spec",
                  "title": "Trang tác giả", "wait_reason": "chờ slot build · toàn cục 3/3"}],
       "recent": []},
      {"slug": "myapp", "full": "org/myapp", "enabled": True, "paused": False,
       "running": 2, "wip": {"max": 3},
       "queue": [
         {"repo": "myapp", "number": 44, "rule": "07-build", "title": "Export CSV",
          "wait_reason": "repo đã dùng 2/2 slot"},
         {"repo": "myapp", "number": 47, "rule": "04-evidence",
          "title": "bằng chứng cho SHA 9f3c1ab",
          "wait_reason": "chờ slot evidence · toàn cục 1/1"}],
       "recent": [{"id": "myapp-39", "repo": "myapp", "number": 39, "rule": "04-evidence",
                   "result": "ok", "turns": 12, "duration_s": 403, "at": NOW}]},
      {"slug": "shop", "full": "org/shop", "enabled": True, "paused": False,
       "running": 2, "wip": {"max": 3},
       "queue": [{"repo": "shop", "number": 36, "rule": "07-build",
                  "title": "Sửa lỗi tính thuế", "wait_reason": "repo đã dùng 2/2 slot"}],
       "recent": [{"id": "shop-29", "repo": "shop", "number": 29, "rule": "03-run-ci",
                   "result": "ok", "turns": 0, "duration_s": 68, "at": NOW}]}]}},

"co-su-co": {
  "label": "Có sự cố",
  "note": "Một repo bị PM dừng bằng .agent/PAUSE, một task thất bại. "
          "Khối “Cần chú ý” chỉ xuất hiện đúng lúc này.",
  "data": {
    "heartbeat": ago(19), "mode": "running",
    "slots": {"build": {"used": 1, "max": 3, "per_repo_max": 2},
              "evidence": {"used": 0, "max": 1}},
    "running": [{"id": "myapp-42", "repo": "myapp", "number": 42, "rule": "07-build",
                 "pool": "build", "started_at": NOW, "elapsed_s": 331}],
    "repos": [
      {"slug": "myapp", "full": "org/myapp", "enabled": True, "paused": False,
       "running": 1, "wip": {"max": 3}, "queue": [],
       "recent": [{"id": "myapp-40", "repo": "myapp", "number": 40, "rule": "04-evidence",
                   "result": "fail", "turns": 31, "duration_s": 1502, "at": NOW}]},
      {"slug": "shop", "full": "org/shop", "enabled": True, "paused": True,
       "running": 0, "wip": {"max": 3},
       "queue": [{"repo": "shop", "number": 33, "rule": "07-build",
                  "title": "Đổi luồng thanh toán",
                  "wait_reason": "chờ người duyệt spec"}],
       "recent": [{"id": "shop-31", "repo": "shop", "number": 31, "rule": "01-recover-stale",
                   "result": "gave-up", "turns": 0, "duration_s": 3, "at": NOW}]}]}},

"reconciler-chet": {
  "label": "Reconciler chết",
  "note": "Chế độ hỏng nguy hiểm nhất: không có gì đỏ để nhìn, chỉ là không có gì "
          "xảy ra. Trang là file tĩnh nên vẫn lên được — và heartbeat cũ tự tố cáo.",
  "data": {
    "heartbeat": ago(2071), "mode": "running",
    "slots": {"build": {"used": 1, "max": 3, "per_repo_max": 2},
              "evidence": {"used": 0, "max": 1}},
    "running": [{"id": "myapp-42", "repo": "myapp", "number": 42, "rule": "07-build",
                 "pool": "build", "started_at": NOW, "elapsed_s": 2402}],
    "repos": [
      {"slug": "myapp", "full": "org/myapp", "enabled": True, "paused": False,
       "running": 1, "wip": {"max": 3},
       "queue": [{"repo": "myapp", "number": 44, "rule": "07-build", "title": "Export CSV",
                  "wait_reason": "xếp sau task khác"}],
       "recent": [{"id": "myapp-39", "repo": "myapp", "number": 39, "rule": "04-evidence",
                   "result": "ok", "turns": 12, "duration_s": 403, "at": NOW}]}]}},

"vua-cai": {
  "label": "Vừa cài xong",
  "note": "Sau install.sh: hệ thống nằm im, chưa có repo nào. "
          "Trang phải nói được bước tiếp theo thay vì hiện một trang trống.",
  "data": {"heartbeat": ago(7), "mode": "paused",
           "slots": {"build": {"used": 0, "max": 3, "per_repo_max": 2},
                     "evidence": {"used": 0, "max": 1}},
           "running": [], "repos": []}},
}

fx_json = json.dumps({k: v for k, v in fixtures.items()}, ensure_ascii=False, indent=1)

OUT.write_text(f"""<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dashboard bee — mockup</title>
<!--
  SINH TỰ ĐỘNG — đừng sửa tay.

  Nguồn: apps/reconciler/public/index.html (CSS và hàm render() lấy nguyên si)
  Sinh lại: python3 apps/reconciler/public/make-mockup.py

  Khác bản thật đúng một chỗ: thay fetch("status.json") bằng 5 bộ dữ liệu giả,
  để duyệt giao diện mà không cần dựng cả hệ thống.
-->
<style>
  /* reset tối thiểu — bản standalone không được host cấp sẵn */
  html {{ -webkit-text-size-adjust: 100%; }}
  body {{ margin: 0; }}
</style>
<style>
{css}
/* ---- chỉ có trong bản mockup, không có trong file thật ---- */
.mk-bar {{
  position:sticky; top:0; z-index:10; background:var(--surface);
  border-bottom:1px solid var(--line); margin:0 -20px 0; padding:12px 20px;
  display:flex; gap:8px; align-items:center; flex-wrap:wrap;
}}
.mk-bar .mk-t {{ font-family:var(--mono); font-size:11px; letter-spacing:.1em;
  text-transform:uppercase; color:var(--ink-3); margin-right:6px; }}
.mk-bar button {{
  font:inherit; font-size:13px; padding:5px 12px; border-radius:5px; cursor:pointer;
  background:var(--ground); color:var(--ink-2); border:1px solid var(--line);
}}
.mk-bar button:hover {{ color:var(--ink); }}
.mk-bar button[aria-pressed="true"] {{
  background:var(--orch); border-color:var(--orch); color:var(--ground); font-weight:600; }}
.mk-bar button:focus-visible {{ outline:2px solid var(--orch); outline-offset:2px; }}
.mk-note {{
  margin:0 -20px 20px; padding:11px 20px; background:var(--surface-2);
  border-bottom:1px solid var(--line-2); color:var(--ink-2); font-size:13.5px;
}}
.mk-note b {{ color:var(--ink); font-weight:600; }}
</style>

</head>
<body>
<div class="wrap">
<div class="mk-bar" id="mkbar"><span class="mk-t">Mockup · chọn cảnh</span></div>
<div class="mk-note" id="mknote"></div>
{body}
</div>

<script>
"use strict";
{js}

var FIXTURES = {fx_json};

// Fixture ghi heartbeat dạng "__AGO_n__" để mọi lần mở trang đều ra đúng số giây.
function hydrate(o) {{
  return JSON.parse(JSON.stringify(o), function (k, v) {{
    var m = typeof v === "string" && v.match(/^__AGO_(\\d+)__$/);
    return m ? new Date(Date.now() - m[1] * 1000).toISOString() : v;
  }});
}}

var bar = document.getElementById("mkbar"), note = document.getElementById("mknote");
var keys = Object.keys(FIXTURES);
function show(k) {{
  render(hydrate(FIXTURES[k].data));
  note.textContent = "";
  var b = document.createElement("b");
  b.textContent = FIXTURES[k].label + " — ";
  note.appendChild(b);
  note.appendChild(document.createTextNode(FIXTURES[k].note));
  Array.prototype.forEach.call(bar.querySelectorAll("button"), function (btn) {{
    btn.setAttribute("aria-pressed", String(btn.dataset.k === k));
  }});
  document.getElementById("foot").textContent =
    "mockup · dữ liệu giả · file thật đọc status.json và làm mới mỗi 5 giây";
}}
keys.forEach(function (k) {{
  var b = document.createElement("button");
  b.textContent = FIXTURES[k].label;
  b.dataset.k = k;
  b.onclick = function () {{ show(k); }};
  bar.appendChild(b);
}});
show(keys[0]);
</script>
</body>
</html>
""", encoding="utf-8")
print("đã sinh", OUT, OUT.stat().st_size, "bytes")
