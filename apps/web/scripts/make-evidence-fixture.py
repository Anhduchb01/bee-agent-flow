#!/usr/bin/env python3
"""Sinh cây bằng chứng fixture — cùng hình dạng mà rule 04 ghi ra trên máy thật.

Chạy lại được, không cần mạng, không mượn media của ai:

    python3 apps/web/scripts/make-evidence-fixture.py

Vì sao là GIF chứ không phải MP4: máy dev không có ffmpeg, và một file .mp4 bịa
byte thì không phát được — bằng chứng giả về bằng chứng là thứ tệ nhất có thể
đặt vào bộ fixture. GIF động thì tự sinh được bằng Pillow và phát thật trong
trình duyệt, nên câu "xem ngay trong trang, không tải file về" vẫn kiểm được.
Nhánh <video>/mp4 chỉ chứng minh được ở pha B, trên bằng chứng thật.
"""
import json
import pathlib

from PIL import Image, ImageDraw

OUT = pathlib.Path(__file__).resolve().parents[1] / "src" / "lib" / "fixtures" / "evidence"

BG, INK, ACCENT = (250, 250, 250), (23, 23, 23), (13, 138, 22)
W, H = 480, 300


def frame(caption: str, step: int, total: int) -> Image.Image:
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W - 1, 34], fill=(235, 235, 235))
    d.text((14, 12), caption, fill=INK)
    for row in range(4):
        y = 60 + row * 46
        hit = row < step
        d.rectangle([16, y, W - 16, y + 32], outline=(210, 210, 210))
        d.rectangle([16, y, 20, y + 32], fill=ACCENT if hit else (210, 210, 210))
        d.text((34, y + 10), f"đơn #{1204 + row}", fill=INK)
    d.text((16, H - 26), f"bước {step}/{total}", fill=(120, 120, 120))
    return img


def write_run(slug: str, num: int, sha: str, acs: list[tuple[str, str]]) -> None:
    root = OUT / slug / str(num) / sha
    (root / "shots").mkdir(parents=True, exist_ok=True)

    for ac_slug, caption in acs:
        frames = [frame(caption, i, 4) for i in range(5)]
        frames[0].save(
            root / f"{ac_slug}.gif",
            save_all=True,
            append_images=frames[1:],
            duration=600,
            loop=0,
        )
        for i, f in enumerate(frames[1::2], start=1):
            f.save(root / "shots" / f"{ac_slug}-{i}.png")

    (root / "results.json").write_text(
        json.dumps(
            {
                "sha": sha,
                "suite": "e2e",
                "passed": 4 * len(acs),
                "failed": 0,
                "duration_s": 41 * len(acs),
                "specs": [f"{ac}.spec.ts" for ac, _ in acs],
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    write_run(
        "myapp",
        45,
        "9f3c1ab",
        [
            ("loc-don-theo-trang-thai", "AC1 · lọc đơn theo trạng thái"),
            ("giu-bo-loc-khi-tai-lai", "AC2 · giữ bộ lọc khi tải lại"),
        ],
    )
    write_run("shop", 37, "4b21d70", [("tinh-thue-theo-vung", "AC1 · tính thuế theo vùng")])
    print(f"đã ghi {OUT}")
