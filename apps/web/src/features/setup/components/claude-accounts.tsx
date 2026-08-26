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
  nhanTaiKhoanCapAction,
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
          in use
        </span>
      )}
      {slot.hetHan && (
        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-2xs font-medium text-amber-500">
          expired — sign in again
        </span>
      )}
      <span className="flex-1" />
      <Thanh nhan="5h" muc={slot.namGio} />
      <Thanh nhan="7d" muc={slot.bayNgay} />
      {!slot.dangBat && (
        <Button size="sm" variant="outline" disabled={dang} onClick={() => doi(slot.name)}>
          Use this one
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
  const [tin, setTin] = useState("");

  function chay(viec: () => Promise<{ ok: boolean; message: string }>) {
    if (dang) return;
    batDau(async () => {
      const ket = await viec();
      setLoi(ket.ok ? "" : ket.message);
      setTin(ket.ok ? ket.message : "");
      router.refresh();
    });
  }

  /**
   * Ô token + nút nhận tài khoản admin cấp. Hiện ở CẢ HAI trạng thái: cài
   * rồi mà giấu đi thì không còn đường dán token mới, mà đó đúng là việc
   * người dùng cần khi admin vừa cấp lại — hỏi 25/08.
   */
  const khoiToken = (
    <div className="flex flex-col gap-2">
      <form
        className="flex flex-wrap gap-2"
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
          placeholder="Paste TOKEN_SLAYER_TOKEN"
          aria-label="Token token-slayer"
          autoComplete="off"
          className="min-w-48 flex-1 font-mono"
        />
        <Button type="submit" disabled={dang || tokenSlayer.trim() === ""}>
          {dang ? "Installing…" : trangThai.daCai ? "Reinstall / change token" : "Install"}
        </Button>
        {trangThai.daCai && (
          <Button
            type="button"
            variant="outline"
            disabled={dang}
            onClick={() => chay(nhanTaiKhoanCapAction)}
          >
            Pull accounts your admin granted
          </Button>
        )}
      </form>
      <p className="text-xs text-muted-foreground">
        The token travels through the environment, never through the command line — anyone on the
        machine can read argv. The installer comes from{" "}
        <span className="font-mono">token-slayer.ownego.com</span>, hard-coded in the source. This
        token is a ticket into the slayer service, <strong>not</strong> a Claude login: it only pulls
        down the accounts an admin has granted you.
      </p>
      {tin !== "" && (
        <pre className="overflow-x-auto rounded-control border border-border bg-muted/40 p-2.5 font-mono text-2xs leading-relaxed text-body">
          {tin}
        </pre>
      )}
    </div>
  );

  if (!trangThai.daCai) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-body">
          <span className="font-mono">token-slayer</span> is not installed — once it is, bee can
          hold several Claude accounts and switch between them right here.
        </p>
        {khoiToken}
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
            <span className="font-mono">claude.env</span> pins a token — sessions run on that token,
            <strong> not</strong> on the account picked here.
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={dang}
            onClick={() => chay(boTokenGhimAction)}
          >
            Remove the pinned token
          </Button>
        </div>
      )}

      {trangThai.message !== null && (
        <p className="text-xs text-destructive">{trangThai.message}</p>
      )}

      {slots.length === 0 ? (
        <p className="text-sm text-body">
          No accounts in the pool yet. Add one below — give it a name, then{" "}
          <strong>Sign in with another account</strong>.
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
            placeholder="Slot name, e.g. work"
            aria-label="New slot name"
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
                : "No login session on this machine to capture — use the button next to it"
            }
          >
            Save the account already signed in
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
            {dang ? "Opening…" : "Sign in with another account"}
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
              1 · Open the approval page ↗
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
                placeholder="2 · Paste the confirmation code"
                aria-label="Confirmation code"
                autoComplete="off"
                className="flex-1 font-mono"
              />
              <Button type="submit" disabled={dang || code.trim() === ""}>
                {dang ? "Checking…" : "Done"}
              </Button>
            </form>
          </div>
        )}
      </div>

      <details className="rounded-control border border-border p-3">
        <summary className="cursor-pointer text-xs text-muted-foreground">
          Slayer token · company accounts
        </summary>
        <div className="mt-3">{khoiToken}</div>
      </details>

      {loi !== "" && <p className="text-xs text-destructive">{loi}</p>}
      {!trangThai.coLoginMay && (
        <p className="text-xs text-muted-foreground">
          This machine runs on the token pasted above, not on a login session — so there is nothing
          to “save”. Add an account with <strong>Sign in with another account</strong>.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Switching accounts switches the whole machine. With a session still running the switch is
        refused — that session would drift onto the new account the moment it refreshes its token,
        and that is the kind of failure nobody ever traces back.
      </p>
    </div>
  );
}
