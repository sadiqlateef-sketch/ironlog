"use client";

// Student lens: short cited notes on each nutrient, a quick quiz for study
// breaks, and your own foods ranked by protein per dollar (from prices you typed).

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LensCardBody } from "@/components/food/lens-card";
import { listFoods, NUTRITION_EVENT } from "@/lib/offline/nutrition-store";
import { LENS_CARDS, LENS_DISCLAIMER } from "@/lib/nutrition/lens-content";
import { quizFrom } from "@/lib/nutrition/lens";
import { rankByValue, valueText } from "@/lib/nutrition/value";
import type { Food } from "@/lib/nutrition/diary-types";
import { cn } from "@/lib/utils";

type Tab = "learn" | "quiz" | "value";

export function LensScreen() {
  const [tab, setTab] = useState<Tab>(() => (window.location.hash === "#quiz" ? "quiz" : window.location.hash === "#value" ? "value" : "learn"));
  const [open, setOpen] = useState<string | null>(() => (window.location.hash.startsWith("#lens-") ? window.location.hash.slice(6) : null));
  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Back to diary">
          <Link href="/food/">
            <ChevronLeft />
          </Link>
        </Button>
        <div className="flex min-w-0 flex-col">
          <h1 className="text-2xl leading-tight font-bold">Student lens</h1>
          <p className="text-muted-foreground text-xs">{LENS_DISCLAIMER}</p>
        </div>
      </header>
      <div className="flex gap-2" role="tablist" aria-label="Student lens">
        {(
          [
            ["learn", "Learn"],
            ["quiz", "Quiz"],
            ["value", "Protein per $"],
          ] as const
        ).map(([t, label]) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              "h-9 flex-1 rounded-full border px-3 text-sm font-semibold",
              tab === t ? "bg-foreground text-background border-transparent" : "text-muted-foreground bg-transparent",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "learn" && (
        <div className="flex flex-col gap-2">
          {LENS_CARDS.map((c) => (
            <Card key={c.key} className="gap-2 p-3">
              <button type="button" className="text-left text-base font-semibold" aria-expanded={open === c.key} onClick={() => setOpen(open === c.key ? null : c.key)}>
                {c.title}
              </button>
              {open === c.key && <LensCardBody card={c} />}
            </Card>
          ))}
        </div>
      )}
      {tab === "quiz" && <Quiz />}
      {tab === "value" && <Value />}
    </div>
  );
}

function Quiz() {
  const [seed] = useState(() => Math.floor(Math.random() * 1000));
  const questions = useMemo(() => {
    const q = quizFrom(LENS_CARDS, seed);
    // A different order each visit.
    return q.map((x, i) => ({ x, r: (i * 31 + seed) % 97 })).sort((a, b) => a.r - b.r).map((y) => y.x);
  }, [seed]);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  if (i >= questions.length) {
    return (
      <Card className="gap-3 p-4">
        <p className="text-lg font-semibold">
          {score} of {questions.length} right
        </p>
        <Button
          type="button"
          onClick={() => {
            setI(0);
            setScore(0);
            setPicked(null);
          }}
        >
          Again
        </Button>
      </Card>
    );
  }
  const q = questions[i];
  const card = LENS_CARDS.find((c) => c.key === q.key);
  return (
    <Card className="gap-3 p-4" data-testid="lens-quiz">
      <p className="text-muted-foreground text-xs">
        Question {i + 1} of {questions.length} · {card?.title}
      </p>
      <p className="text-base font-medium">{q.prompt}</p>
      <div className="grid grid-cols-2 gap-2">
        {q.choices.map((c) => (
          <Button
            key={c}
            type="button"
            variant={picked === null ? "outline" : c === q.answer ? "default" : c === picked ? "destructive" : "outline"}
            disabled={picked !== null}
            onClick={() => {
              setPicked(c);
              if (c === q.answer) setScore((s) => s + 1);
            }}
          >
            {c}
          </Button>
        ))}
      </div>
      {picked !== null && (
        <>
          {card && <p className="text-muted-foreground text-xs">From: {card.sources[0]?.title}</p>}
          <Button
            type="button"
            onClick={() => {
              setPicked(null);
              setI(i + 1);
            }}
          >
            Next
          </Button>
        </>
      )}
    </Card>
  );
}

function Value() {
  const [foods, setFoods] = useState<Food[] | null>(null);
  useEffect(() => {
    const load = () => {
      listFoods()
        .then(setFoods)
        .catch(() => setFoods((f) => f ?? []));
    };
    load();
    window.addEventListener(NUTRITION_EVENT, load);
    return () => window.removeEventListener(NUTRITION_EVENT, load);
  }, []);
  const ranked = useMemo(() => rankByValue((foods ?? []).filter((f) => !f.archived)), [foods]);
  if (foods === null) return null;
  if (ranked.length === 0) {
    return <p className="text-muted-foreground text-sm">Add a price when you create a food (price and the amount it buys) to see which foods give the most protein for the money.</p>;
  }
  return (
    <ul className="glass rounded-2xl p-1" data-testid="lens-value">
      {ranked.map(({ food, perDollar }) => (
        <li key={food.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
          <span className="min-w-0 truncate font-medium">{food.name}</span>
          <span className="text-muted-foreground shrink-0 tabular-nums">{valueText(perDollar)}</span>
        </li>
      ))}
    </ul>
  );
}
