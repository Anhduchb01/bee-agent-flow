"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BeeSlotClaude } from "@/lib/bee/slayer";
import type { TrangThaiSlayer } from "@/lib/bee/slayer-ctl";

import {
  batDauThemSlotAction,
  boTokenGhimAction,
  caiSlayerAction,
  chupSlotAction,
  doiSlotAction,
  xongThemSlotAction,
} from "../api/actions";

/** Thanh dùng — vẽ được cả khi slayer chưa kịp hỏi usage. */
function Thanh({ nhan, muc }: { nhan: string; muc: { phanTram: number } | null }) {
  if (muc === null) return <span className="font-mono text-2xs text-muted-foreground">{nhan} —</span>;
  const gap = muc.phanTram >= 85;
  return (
    <span className="flex items-center gap-1.5">
      <span className="font-mono text-2xs text-muted-foreground">{nhan}</span>
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
        <span
          className={`block h-full ${gap ? "bg-amber-500" : "bg-emerald-500"}`}
          style={{ width: `${muc.phanTram}%` }}
        />
      </span>
      <span className="font-mono text-2xs tabular-nums text-muted-foreground">
        {Math.round(muc.phanTram)}%
      </span>
    </span>
  );
}

function Hang({
  slot,
  dang,
  doi,
}: {
  slot: BeeSlotClaude;
  dang: boolean;
  doi: (t: string) => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border py-2 first:border-t-0">
      <span className="font-mono text-xs text-muted-foreground">{slot.index}</span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm text-body">{slot.name}</span>
        {slot.email !== null && slot.email !== slot.name && (
          <span className="truncate font-mono text-2xs text-muted-foreground">{slot.email}</span>
        )}
      </span>
      {slot.dangBat && (
        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-2xs font-medium text-emerald-500">
          đang dùng
        </span>
      )}
      {slot.hetHan && (
        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-2xs font-medium text-amber-500">
          hết hạn — đăng nhập lại
        </span>
      )}
      <span className="flex-1" />
      <Thanh nhan="5h" muc={slot.namGio} />
      <Thanh nhan="7d" muc={slot.bayNgay} />
      {!slot.dangBat && (
        <Button size="sm" variant="outline" disabled={dang} onClick={() => doi(slot.name)}>
          Dùng cái này
        </Button>
      )}
    </li>
  );
}

/**
 * Nhiều tài khoản Claude trên bee, đổi qua lại được từ điện thoại.
 *
 * Hai điều panel này cố ý nói to, vì cả hai đều là kiểu sai lặng lẽ:
 *  · đổi tài khoản là đổi cho CẢ MÁY (nó ghi `~/.claude/.credentials.json`),
 *    nên phiên đang chạy sẽ trôi theo — lớp dưới từ chối khi còn phiên chạy;
 *  · token dán ở bước "Đăng nhập Claude" ĐÈ LÊN lựa chọn ở đây, vì runner
 *    export `CLAUDE_CODE_OAUTH_TOKEN` và biến môi trường thắng file
 *    credential. Còn nó thì bảng này chỉ là trang trí.
 */
export function ClaudeAccounts({ trangThai }: { trangThai: TrangThaiSlayer }) {
  const router = useRouter();
  const [dang, batDau] = useTransition();
  const [loi, setLoi] = useState("");
  const [tokenSlayer, setTokenSlayer] = useState("");
  const [tenMoi, setTenMoi] = useState("");
  const [url, setUrl] = useState("");
  const [code, setCode] = useState("");

  function chay(viec: () => Promise<{ ok: boolean; message: string }>) {
    if (dang) return;
    batDau(async () => {
      const ket = await viec();
      setLoi(ket.ok ? "" : ket.message);
      router.refresh();
    });
  }

  if (!trangThai.daCai) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-body">
          Chưa cài <span className="font-mono">token-slayer</span> — cài rồi thì bee giữ được nhiều
          tài khoản Claude và đổi qua lại ngay ở đây.
        </p>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (tokenSlayer.trim() === "") return;
            chay(async () => {
              const ket = await caiSlayerAction(tokenSlayer);
              if (ket.ok) setTokenSlayer("");
              return ket;
            });
          }}
        >
          <Input
            value={tokenSlayer}
            onChange={(e) => setTokenSlayer(e.target.value)}
            placeholder="Dán TOKEN_SLAYER_TOKEN"
            aria-label="Token token-slayer"
            autoComplete="off"
            className="flex-1 font-mono"
          />
          <Button type="submit" disabled={dang || tokenSlayer.trim() === ""}>
            {dang ? "Đang cài…" : "Cài"}
          </Button>
        </form>
        <p className="text-xs text-muted-foreground">
          Token đi qua biến môi trường, không qua dòng lệnh — argv thì ai trên máy cũng đọc được.
          Trình cài đặt lấy từ <span className="font-mono">token-slayer.ownego.com</span>, ghim cứng
          trong mã.
        </p>
        {loi !== "" && <p className="text-xs text-destructive">{loi}</p>}
      </div>
    );
  }

  const slots = trangThai.pool?.slots ?? [];

  return (
    <div className="flex flex-col gap-3">
      {trangThai.tokenGhim && (
        <div className="flex flex-wrap items-center gap-2 rounded-control border border-amber-500/40 bg-amber-500/10 p-3">
          <span className="flex-1 text-xs text-body">
            <span className="font-mono">claude.env</span> đang ghim một token — phiên chạy bằng token
            đó, <strong>không</strong> theo tài khoản chọn ở đây.
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={dang}
            onClick={() => chay(boTokenGhimAction)}
          >
            Gỡ token ghim
          </Button>
        </div>
      )}

      {trangThai.message !== null && (
        <p className="text-xs text-destructive">{trangThai.message}</p>
      )}

      {slots.length === 0 ? (
        <p className="text-sm text-body">
          Chưa có tài khoản nào trong pool. Thêm bằng ô bên dưới — đặt tên rồi{" "}
          <strong>Đăng nhập tài khoản khác</strong>.
        </p>
      ) : (
        <ul className="flex flex-col rounded-control border border-border bg-muted/20 px-3">
          {slots.map((s) => (
            <Hang key={s.name} slot={s} dang={dang} doi={(t) => chay(() => doiSlotAction(t))} />
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2 rounded-control border border-border p-3">
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (tenMoi.trim() === "") return;
            chay(async () => {
              const ket = await chupSlotAction(tenMoi);
              if (ket.ok) setTenMoi("");
              return ket;
            });
          }}
        >
          <Input
            value={tenMoi}
            onChange={(e) => setTenMoi(e.target.value)}
            placeholder="Tên slot, ví dụ work"
            aria-label="Tên slot mới"
            autoComplete="off"
            className="min-w-40 flex-1 font-mono"
          />
          <Button
            type="submit"
            variant="outline"
            disabled={dang || tenMoi.trim() === "" || !trangThai.coLoginMay}
            title={
              trangThai.coLoginMay
                ? undefined
                : "Máy chưa có phiên đăng nhập nào để chụp — dùng nút bên cạnh"
            }
          >
            Lưu tài khoản đang đăng nhập
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={dang || tenMoi.trim() === ""}
            onClick={() =>
              batDau(async () => {
                const ket = await batDauThemSlotAction(tenMoi);
                if (ket.ok) {
                  setUrl(ket.url);
                  setLoi("");
                } else setLoi(ket.message);
              })
            }
          >
            {dang ? "Đang mở…" : "Đăng nhập tài khoản khác"}
          </Button>
        </form>

        {url !== "" && (
          <div className="flex flex-col gap-2 rounded-control border border-border bg-muted/30 p-3">
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-body underline underline-offset-2"
            >
              1 · Mở trang duyệt ↗
            </a>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (code.trim() === "") return;
                chay(async () => {
                  const ket = await xongThemSlotAction(code);
                  if (ket.ok) {
                    setCode("");
                    setUrl("");
                    setTenMoi("");
                  }
                  return ket;
                });
              }}
            >
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="2 · Dán mã xác nhận"
                aria-label="Mã xác nhận"
                autoComplete="off"
                className="flex-1 font-mono"
              />
              <Button type="submit" disabled={dang || code.trim() === ""}>
                {dang ? "Đang kiểm…" : "Xong"}
              </Button>
            </form>
          </div>
        )}
      </div>

      {loi !== "" && <p className="text-xs text-destructive">{loi}</p>}
      {!trangThai.coLoginMay && (
        <p className="text-xs text-muted-foreground">
          Máy này chạy bằng token dán ở bước trên, không phải một phiên đăng nhập — nên không có gì
          để “lưu lại”. Thêm tài khoản bằng <strong>Đăng nhập tài khoản khác</strong>.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Đổi tài khoản là đổi cho cả máy. Còn phiên đang chạy thì thao tác này bị từ chối — phiên đó
        sẽ trôi sang tài khoản mới lúc nó làm mới token, và đó là kiểu hỏng không ai lần ra được.
      </p>
    </div>
  );
}
