"use client";

import { useState } from "react";
import { Clock, RefreshCw, Search, X } from "lucide-react";
import type { CatalogueCourse, CourseTopic } from "@/lib/courses";
import { tint, topicTheme } from "@/lib/topic-theme";

/**
 * The whole catalogue, grouped by topic, with a search box and topic filter.
 * Every card is in the server-rendered HTML, so search engines and anyone
 * without JavaScript still see all of them.
 */
export function CourseBrowser({
  courses,
  topics,
}: {
  courses: CatalogueCourse[];
  topics: CourseTopic[];
}) {
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState<CourseTopic | null>(null);

  const q = query.trim().toLowerCase();
  const shown = courses.filter(
    (c) =>
      (!topic || c.topic === topic) &&
      (!q || c.title.toLowerCase().includes(q) || c.summary.toLowerCase().includes(q)),
  );

  return (
    <div>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          <TopicChip active={!topic} onClick={() => setTopic(null)} label="All" count={courses.length} />
          {topics.map((t) => (
            <TopicChip
              key={t}
              active={topic === t}
              onClick={() => setTopic(topic === t ? null : t)}
              label={t}
              count={courses.filter((c) => c.topic === t).length}
              color={topicTheme(t).color}
            />
          ))}
        </div>
        <label className="relative block w-full lg:w-72">
          <span className="sr-only">Search courses</span>
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#0f2f3c]/40" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search courses"
            className="w-full rounded-full bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm ring-1 ring-[#134f63]/15 outline-none placeholder:text-[#0f2f3c]/40 focus:ring-2 focus:ring-[#3a9fc4]"
          />
        </label>
      </div>

      {shown.length === 0 ? (
        <div className="mt-10 rounded-3xl bg-white p-10 text-center ring-1 ring-[#134f63]/10">
          <p className="font-semibold">No course matches &ldquo;{query}&rdquo;.</p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setTopic(null);
            }}
            className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[#1d6f8a] underline underline-offset-2"
          >
            <X className="size-4" /> Clear the search
          </button>
        </div>
      ) : (
        topics.map((t) => {
          const list = shown.filter((c) => c.topic === t);
          if (list.length === 0) return null;
          const { color, icon: Icon } = topicTheme(t);
          return (
            <section key={t} className="mt-12 first-of-type:mt-10">
              <div className="flex items-center gap-3">
                <span
                  className="flex size-10 items-center justify-center rounded-xl"
                  style={{ backgroundColor: tint(color, "1a"), color }}
                >
                  <Icon className="size-5" />
                </span>
                <h2 className="font-display text-2xl font-semibold tracking-tight">{t}</h2>
                <span className="text-sm text-[#0f2f3c]/50">
                  {list.length} {list.length === 1 ? "course" : "courses"}
                </span>
              </div>
              <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((c) => (
                  <CourseCard key={c.slug} course={c} color={color} />
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}

function CourseCard({ course, color }: { course: CatalogueCourse; color: string }) {
  const renew =
    course.renewMonths % 12 === 0 && course.renewMonths > 12
      ? `Renew every ${course.renewMonths / 12} years`
      : course.renewMonths === 12
        ? "Renew yearly"
        : `Renew every ${course.renewMonths} months`;
  return (
    <li
      className="flex flex-col rounded-2xl border-t-4 bg-white p-5 shadow-sm ring-1 ring-[#134f63]/8"
      style={{ borderTopColor: color }}
    >
      <h3 className="font-semibold leading-snug text-[#0f2f3c]">{course.title}</h3>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-[#0f2f3c]/65">{course.summary}</p>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[#0f2f3c]/55">
        <span className="inline-flex items-center gap-1.5">
          <Clock className="size-3.5" /> About {course.minutes} min
        </span>
        <span className="inline-flex items-center gap-1.5">
          <RefreshCw className="size-3.5" /> {renew}
        </span>
        {course.careCertificate && (
          <span className="rounded-full bg-[#fbf3ea] px-2 py-0.5 font-semibold text-[#8a4d0c]">
            Care Certificate · Standard {course.careCertificate}
          </span>
        )}
      </div>
    </li>
  );
}

function TopicChip({
  active,
  onClick,
  label,
  count,
  color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  color?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
        active
          ? "bg-[#134f63] text-white shadow-md shadow-[#134f63]/20"
          : "bg-white text-[#134f63] shadow-sm ring-1 ring-[#134f63]/10 hover:-translate-y-0.5 hover:shadow-md"
      }`}
    >
      {color && <span className="size-2 rounded-full" style={{ backgroundColor: color }} />}
      {label}
      <span className={active ? "text-white/70" : "text-[#134f63]/50"}>{count}</span>
    </button>
  );
}
