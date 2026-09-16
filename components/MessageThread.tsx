"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MessageCircle, Send } from "lucide-react";
import { cn, initials, relativeDay } from "@/lib/format";
import type { Message } from "@/lib/types";

/** Shared client ↔ team conversation, rendered from the viewer's side. */
export default function MessageThread({
  messages,
  viewer,
  title,
  subtitle,
  placeholder,
  onSend,
  className,
}: {
  messages: Message[];
  viewer: "client" | "team";
  title: string;
  subtitle?: string;
  placeholder: string;
  onSend: (text: string) => void;
  className?: string;
}) {
  const [text, setText] = useState("");
  const listRef = useRef<HTMLOListElement>(null);
  const last = messages[messages.length - 1];
  const awaitingReply = last && last.from !== viewer;

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText("");
  };

  return (
    <div className={className}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="flex items-center gap-2 font-display text-lg font-bold">
            <MessageCircle className="size-5 text-brand" /> {title}
          </h4>
          {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
        </div>
        {awaitingReply && viewer === "team" && (
          <span className="shrink-0 rounded-full bg-brand px-2.5 py-1 text-[10px] font-bold uppercase text-white">Needs reply</span>
        )}
      </div>

      {messages.length > 0 ? (
        <ol ref={listRef} className="mt-4 max-h-80 space-y-3 overflow-y-auto pr-1">
          <AnimatePresence initial={false}>
            {messages.map((m) => {
              const mine = m.from === viewer;
              return (
                <motion.li
                  key={m.id}
                  initial={{ opacity: 0, y: 10, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  className={cn("flex items-end gap-2", mine && "flex-row-reverse")}
                >
                  <span
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white",
                      m.from === "client" ? "bg-teal" : "bg-navy",
                    )}
                  >
                    {initials(m.author)}
                  </span>
                  <div className={cn("max-w-[80%]", mine && "text-right")}>
                    <div
                      className={cn(
                        "inline-block rounded-2xl px-3.5 py-2.5 text-left text-sm leading-relaxed",
                        mine ? "rounded-br-md bg-navy text-white" : "rounded-bl-md bg-mist text-navy",
                      )}
                    >
                      {m.text}
                    </div>
                    <p className="mt-1 px-1 text-[11px] text-muted">
                      {m.author}
                      {m.from === "team" ? " · Aptech team" : " · Client"} · {relativeDay(m.at)}
                    </p>
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ol>
      ) : (
        <p className="mt-4 rounded-2xl border border-dashed border-line p-4 text-sm text-muted">No messages yet.</p>
      )}

      {awaitingReply && viewer === "client" && (
        <p className="mt-3 text-xs font-bold text-brand-700">Waiting for a reply · usually within 1 working day</p>
      )}

      <form onSubmit={submit} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="h-11 flex-1 rounded-xl border border-line bg-white px-4 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="flex h-11 items-center justify-center gap-2 rounded-xl bg-navy px-5 text-sm font-bold text-white transition hover:bg-navy-700 disabled:opacity-40"
        >
          <Send className="size-4" /> Send
        </button>
      </form>
    </div>
  );
}
