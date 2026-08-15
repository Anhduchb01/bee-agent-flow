#!/usr/bin/env node
// spec-chat.mjs — cầu nối giữa web app và Claude, cho cửa sổ phỏng vấn tạo task.
//
// VÌ SAO CẦN MỘT TIẾN TRÌNH RIÊNG:
//
// `bee-web` không có credential Claude và không được có. Nó là user duy nhất
// trong hệ thống này đưa ra internet; cho nó chạy `claude` là đặt login Claude
// vào đúng tiến trình dễ bị tấn công nhất. Nhưng người dùng thì cần một cửa sổ
// chat trả lời trong vài giây, mà đường qua GitHub thì mất ít nhất một tick.
//
// Nên: tiến trình này chạy dưới `bee-agent` (đã có login), nghe trên một Unix
// socket mà chỉ group `bee-web` mở được. Web app gửi văn bản, nhận văn bản.
// Không có đường nào từ đó tới credential, và không có cổng TCP nào để quét.
//
// KHÔNG CÓ TOOL NÀO ĐƯỢC BẬT. Vai trò này chỉ phỏng vấn — nó không đọc code,
// không chạy lệnh, không mở file. Một role có quyền đọc đĩa ở đầu kia một
// socket là thứ khó bảo vệ hơn hẳn một role không có. Việc đối chiếu với
// codebase là của rule 08, chạy trong worktree chỉ-đọc ngay sau đó.

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { chmodSync, existsSync, unlinkSync } from "node:fs";
import { readFile } from "node:fs/promises";

const SOCKET = process.env.BEE_SPEC_SOCKET ?? "/run/bee/spec-chat.sock";
const PROMPT_DIR = process.env.BEE_SPEC_PROMPT_DIR ?? "/opt/bee/prompts";
const WORK_DIR = process.env.BEE_WORK_DIR ?? "/srv/bee/work";

/**
 * Hai vai, hai prompt.
 *
 *   spec     phỏng vấn để tạo task mới. Không phiên cũ, cwd không quan trọng.
 *   hoi-run  hỏi về một lần chạy đã xong. NỐI LẠI phiên của lần chạy đó.
 *
 * Danh sách CHO PHÉP, không phải ghép chuỗi: `mode` đến từ trình duyệt và nó
 * quyết định file nào được đọc.
 */
const VAI = {
  spec: "spec-chat.md",
  "hoi-run": "ask-run.md",
  "du-an": "project-chat.md",
};
const MAX_TURNS = Number(process.env.BEE_SPEC_MAX_TURNS ?? 12);

// Trần đồng thời. Mỗi phiên chat là một lần gọi model, cùng hạn mức với task
// build — nên hai người mở chat không được quyền làm đói cả hàng đợi.
const MAX_SONG_SONG = Number(process.env.BEE_SPEC_MAX_CONCURRENT ?? 2);
let dangChay = 0;

// Giới hạn kích thước tin nhắn. Không phải để tiết kiệm, mà vì phần thân request
// đi thẳng vào argv của một tiến trình con.
const MAX_BYTES = 32 * 1024;

const log = (...a) => console.error(new Date().toISOString(), ...a);

/**
 * Dịch lỗi của Claude CLI thành câu nói được PHẢI LÀM GÌ.
 *
 * "401 OAuth access token has been revoked" là đúng và vô dụng: người đọc nó
 * đang ngồi trong một ô chat trên trình duyệt, không biết `bee-agent` là gì và
 * không có ssh vào máy. Câu nguyên văn vẫn được giữ ở cuối, vì người có ssh thì
 * cần đúng chuỗi đó để tìm.
 */
function deHieu(raw) {
  const t = String(raw ?? "");
  if (/revoked|401|unauthoriz|not logged in|authenticate/i.test(t)) {
    return (
      "Agent chưa đăng nhập được vào Claude. Trên máy chạy bee:\n" +
      "    sudo -u bee-agent -H claude      rồi gõ /login\n\n" +
      "Hay gặp nhất sau khi cài bằng --claude-from: token bản copy bị thu hồi " +
      "khi user nguồn làm mới phiên của họ.\n\n" +
      `Nguyên văn: ${t}`
    );
  }
  if (/rate.?limit|quota|usage limit/i.test(t)) {
    return `Hết hạn mức Claude — chờ cửa sổ hạn mức reset rồi thử lại.\n\nNguyên văn: ${t}`;
  }
  return t;
}

function ndjson(res, obj) {
  res.write(JSON.stringify(obj) + "\n");
}

async function docBody(req) {
  const chunks = [];
  let n = 0;
  for await (const c of req) {
    n += c.length;
    if (n > MAX_BYTES) throw new Error("message too large");
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

/**
 * Một lượt chat.
 *
 * `--resume` là thứ làm nó thành một CUỘC hội thoại chứ không phải một chuỗi
 * câu hỏi rời rạc: Claude nhớ được vì sao nó đã đoán như vậy ở lượt trước, nên
 * lượt sau nó hỏi tiếp chứ không hỏi lại.
 *
 * `session_id` do chính Claude cấp và web app giữ hộ. Ta không tự sinh id: một
 * id tự đặt chỉ là một lớp ánh xạ nữa để lệch.
 */
/**
 * `--resume` CHỈ tìm phiên trong project suy ra từ cwd.
 *
 * Kiểm trên máy thật: từ `/tmp`, resume một session id có thật của
 * `/srv/bee/work/lifebook-assessment-8` trả về "No conversation found". Nên
 * muốn nối lại một lần chạy thì phải đứng đúng thư mục nó đã chạy.
 *
 * Danh sách cho phép cho `id`: nó ghép thẳng vào đường dẫn. `<slug>-<số>` và
 * không gì khác.
 */
function thuMucLamViec(id) {
  if (!id || !/^[a-z0-9][a-z0-9._-]*-\d+$/i.test(id)) return "/tmp";
  return `${WORK_DIR}/${id}`;
}

function goiClaude({ res, message, sessionId, systemPrompt, cwd }) {
  const args = [
    "-p",
    "--output-format", "stream-json",
    "--verbose",
    "--max-turns", String(MAX_TURNS),
    // Không tool nào. Đây là ranh giới, không phải tinh chỉnh.
    "--allowedTools", "",
    "--append-system-prompt", systemPrompt,
  ];
  if (sessionId) args.push("--resume", sessionId);
  args.push(message);

  // Tool vẫn TẮT ở mọi vai. cwd chỉ để Claude tìm ra phiên cũ; nó không mở
  // thêm cánh cửa nào, vì model không có tool nào để đọc thư mục đó.
  const child = spawn("claude", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });

  let buf = "";
  let stderr = "";
  // Đúng MỘT `done` cho mỗi lượt.
  //
  // Claude in dòng `result` rồi thoát với mã 1 khi lượt đó là lỗi, nên hai
  // nhánh dưới cùng bắn `done` — client nhận hai lần và ghi đè thông báo lỗi
  // đầu (thứ nói rõ chuyện gì) bằng thông báo thứ hai ("claude thoát với mã 1",
  // đúng nhưng vô dụng). Gặp thật ngay lượt chạy đầu tiên.
  let xong = false;
  const done = (obj) => {
    if (xong) return;
    xong = true;
    ndjson(res, { type: "done", ...obj });
  };
  child.stderr.on("data", (d) => { stderr += d.toString(); });

  child.stdout.on("data", (d) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      let ev;
      try { ev = JSON.parse(line); } catch { continue; }

      // Chỉ chuyển tiếp thứ web app dùng được. Dòng stream-json còn mang tên
      // tool, đường dẫn, và nội bộ của phiên — không có lý do gì để chúng đi ra
      // một trình duyệt.
      if (ev.type === "assistant") {
        const text = (ev.message?.content ?? [])
          .filter((c) => c.type === "text")
          .map((c) => c.text)
          .join("");
        if (text) ndjson(res, { type: "text", text });
      } else if (ev.type === "result") {
        done({
          session_id: ev.session_id ?? null,
          // `is_error` bắt được đường mà `result` là một câu lỗi chứ không phải
          // câu trả lời — ví dụ "OAuth access token has been revoked", vốn vẫn
          // đi ra ở đúng chỗ này và trông y hệt một câu trả lời bình thường.
          error: ev.is_error ? deHieu(ev.result ?? "unknown error") : null,
          // Câu lỗi đã đi ra một lần dưới dạng `text` (Claude in nó như một câu
          // trả lời bình thường trước khi đóng lượt). Cờ này để client bỏ bong
          // bóng đó đi thay vì hiện cùng một lỗi hai lần.
          replaces_last: ev.is_error === true,
          turns: ev.num_turns ?? 0,
          cost_usd: ev.total_cost_usd ?? 0,
        });
      }
    }
  });

  child.on("error", (e) => {
    done({ error: `không chạy được claude: ${e.message}` });
    res.end();
  });

  child.on("close", (code) => {
    // Chỉ nói gì khi CHƯA có `done` nào — mã thoát khác 0 sau một dòng `result`
    // đã mang lý do thật thì không thêm được thông tin nào.
    if (code !== 0) {
      done({ error: stderr.trim().slice(0, 500) || `claude thoát với mã ${code}` });
    }
    res.end();
  });

  res.on("close", () => { if (!child.killed) child.kill("SIGTERM"); });
}

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, dangChay, max: MAX_SONG_SONG }));
    return;
  }
  if (req.method !== "POST" || req.url !== "/chat") {
    res.writeHead(404).end();
    return;
  }

  if (dangChay >= MAX_SONG_SONG) {
    res.writeHead(503, { "content-type": "application/x-ndjson" });
    ndjson(res, { type: "done", error: "đang có đủ phiên chat chạy, thử lại sau vài giây" });
    res.end();
    return;
  }

  let body;
  try {
    body = await docBody(req);
  } catch (e) {
    res.writeHead(400, { "content-type": "application/x-ndjson" });
    ndjson(res, { type: "done", error: String(e.message ?? e) });
    res.end();
    return;
  }

  const message = String(body.message ?? "").trim();
  if (!message) {
    res.writeHead(400, { "content-type": "application/x-ndjson" });
    ndjson(res, { type: "done", error: "thiếu message" });
    res.end();
    return;
  }
  // Chỉ nhận id có hình dạng UUID. Chuỗi này đi thẳng vào argv của tiến trình
  // con, nên nó phải qua danh sách CHO PHÉP chứ không phải danh sách cấm.
  const sessionId = /^[0-9a-f-]{36}$/i.test(String(body.session_id ?? ""))
    ? String(body.session_id)
    : null;

  const vai = String(body.mode ?? "spec");
  const ten = Object.prototype.hasOwnProperty.call(VAI, vai) ? VAI[vai] : null;
  if (!ten) {
    res.writeHead(400, { "content-type": "application/x-ndjson" });
    ndjson(res, { type: "done", error: `vai không biết: ${vai}` });
    res.end();
    return;
  }

  const cwd = vai === "hoi-run" ? thuMucLamViec(String(body.task_id ?? "")) : "/tmp";
  if (cwd !== "/tmp" && !existsSync(cwd)) {
    // Worktree đã bị dọn (task đóng, hoặc rule 01 gỡ nó). Phiên vẫn còn trong
    // home của agent nhưng không tìm ra được nữa. Nói thẳng ra, đừng để nó đội
    // lốt "Claude không nhớ gì".
    res.writeHead(200, { "content-type": "application/x-ndjson" });
    ndjson(res, {
      type: "done",
      error:
        "Worktree của lần chạy này đã được dọn, nên không nối lại phiên được. Báo cáo và log của lần chạy vẫn xem được ở bên trái.",
    });
    res.end();
    return;
  }

  let systemPrompt;
  const promptFile = `${PROMPT_DIR}/${ten}`;
  try {
    systemPrompt = await readFile(promptFile, "utf8");
  } catch {
    res.writeHead(500, { "content-type": "application/x-ndjson" });
    ndjson(res, { type: "done", error: `không đọc được ${promptFile}` });
    res.end();
    return;
  }

  res.writeHead(200, {
    "content-type": "application/x-ndjson",
    "cache-control": "no-store",
    // Không có proxy nào ở giữa, nhưng nếu một ngày có thì đệm là thứ giết chết
    // cảm giác "đang gõ".
    "x-accel-buffering": "no",
  });

  dangChay += 1;
  res.on("close", () => { dangChay = Math.max(0, dangChay - 1); });
  goiClaude({ res, message, sessionId, systemPrompt, cwd });
});

try { unlinkSync(SOCKET); } catch { /* chưa có socket cũ — bình thường */ }

server.listen(SOCKET, () => {
  // 0660: chủ là bee-agent, group là bee-web. "other" không mở được, nên không
  // có user nào khác trên máy nói chuyện được với login Claude qua đường này.
  chmodSync(SOCKET, 0o660);
  log(`spec-chat nghe ở ${SOCKET}`);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    server.close(() => {
      try { unlinkSync(SOCKET); } catch { /* đã bị dọn rồi */ }
      process.exit(0);
    });
  });
}
