"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { themDuAn } from "../api/actions";

export function AddProjectDialog() {
  const router = useRouter();
  const [mo, setMo] = useState(false);
  const [full, setFull] = useState("");
  const [loi, setLoi] = useState<string | null>(null);
  const [dangChay, startTransition] = useTransition();

  function gui(formData: FormData) {
    setLoi(null);
    startTransition(async () => {
      const ketQua = await themDuAn(String(formData.get("full") ?? ""));
      if (!ketQua.ok) {
        setLoi(ketQua.message);
        return;
      }
      setMo(false);
      setFull("");
      router.refresh();
    });
  }

  return (
    <Dialog open={mo} onOpenChange={setMo}>
      <DialogTrigger render={<Button>Add project</Button>} />
      <DialogContent className="sm:max-w-lg">
        <form action={gui} className="flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle>Add project</DialogTitle>
            <DialogDescription>One project is one GitHub repository.</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor="full" className="eyebrow">
              org/repo
            </Label>
            <Input
              id="full"
              name="full"
              value={full}
              onChange={(e) => setFull(e.target.value)}
              placeholder="org/myapp"
              autoComplete="off"
              required
            />
            {loi ? (
              <p role="alert" className="text-sm text-destructive">
                {loi}
              </p>
            ) : null}
          </div>

          {/* Nói trước điều sẽ xảy ra, thay vì để người dùng tự phát hiện là
              máy chưa động tĩnh gì. */}
          <div className="rounded-card border border-border bg-muted/40 px-4 py-3">
            <p className="eyebrow">One more step on the agent machine</p>
            <p className="mt-1.5 text-sm text-body">
              The app cannot run commands on the machine — it has no sudo and holds no
              orchestrator token. After adding it here, run this on the Ubuntu box so the
              reconciler starts watching:
            </p>
            <code className="mt-2 block rounded-control border border-border bg-card px-2.5 py-1.5 text-xs text-foreground">
              be repo add {full.trim() || "org/repo"}
            </code>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setMo(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={dangChay}>
              {dangChay ? "Adding…" : "Add project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
