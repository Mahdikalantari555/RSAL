"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  ClassDistributionPoint,
  ConfidenceHistoryPoint,
  LearningCurvePoint,
} from "@/types";
import { formatPercent } from "@/lib/utils";

const tooltipStyle = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  fontSize: 11,
  color: "var(--foreground)",
  boxShadow: "0 12px 30px -12px rgba(2,6,23,0.45)",
};

const axisProps = {
  tick: { fontSize: 10, fill: "var(--muted-foreground)" },
  stroke: "var(--border)",
  tickLine: false,
} as const;

export function LearningCurveChart({
  points,
  height = 220,
}: {
  points: LearningCurvePoint[];
  height?: number;
}) {
  if (points.length === 0) {
    return (
      <div className="grid h-full min-h-32 place-items-center text-[11.5px] text-muted">
        Train the model to start the learning curve.
      </div>
    );
  }

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="labeledSamples" {...axisProps} label={{ value: "labels", position: "insideBottomRight", offset: -2, fontSize: 9, fill: "var(--muted-foreground)" }} />
          <YAxis domain={[0.4, 1]} tickFormatter={(value: number) => `${Math.round(value * 100)}%`} {...axisProps} />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(value) => `${value} labeled samples`}
            formatter={(value, name) => [formatPercent(Number(value)), name === "accuracy" ? "Accuracy" : "F1"]}
          />
          <Legend wrapperStyle={{ fontSize: 10, color: "var(--muted-foreground)" }} iconType="plainline" />
          <Line
            type="monotone"
            dataKey="accuracy"
            name="accuracy"
            stroke="var(--primary)"
            strokeWidth={2.2}
            dot={{ r: 2.5, fill: "var(--primary)", strokeWidth: 0 }}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="f1"
            name="f1"
            stroke="var(--accent)"
            strokeWidth={1.8}
            strokeDasharray="4 3"
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ClassDistributionChart({
  data,
  height = 230,
}: {
  data: ClassDistributionPoint[];
  height?: number;
}) {
  if (data.length === 0) {
    return <div className="grid h-full place-items-center text-[11.5px] text-muted">No classes yet.</div>;
  }
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
          <XAxis type="number" {...axisProps} allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="name"
            width={96}
            {...axisProps}
            tick={{ fontSize: 9.5, fill: "var(--muted-foreground)" }}
          />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--surface-muted)", opacity: 0.4 }} />
          <Bar dataKey="count" name="Human labels" radius={[0, 4, 4, 0]} barSize={11}>
            {data.map((entry) => (
              <Cell key={entry.classId} fill={entry.color} />
            ))}
          </Bar>
          <Bar dataKey="suggested" name="Queued" radius={[0, 4, 4, 0]} barSize={5} fill="var(--border-strong)" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ConfidenceHistoryChart({
  history,
  height = 200,
}: {
  history: ConfidenceHistoryPoint[];
  height?: number;
}) {
  if (history.length === 0) {
    return (
      <div className="grid h-full place-items-center text-[11.5px] text-muted">
        Confidence history appears after training.
      </div>
    );
  }
  const data = history.map((point) => ({
    iteration: `R${point.iteration}`,
    confidence: point.meanConfidence,
    labels: point.labeledSamples,
  }));
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
          <defs>
            <linearGradient id="confidenceFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.42} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="iteration" {...axisProps} />
          <YAxis domain={[0.4, 1]} tickFormatter={(value: number) => `${Math.round(value * 100)}%`} {...axisProps} />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value) => [formatPercent(Number(value)), "Mean confidence"]}
          />
          <Area
            type="monotone"
            dataKey="confidence"
            stroke="var(--accent)"
            strokeWidth={2}
            fill="url(#confidenceFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ConfidenceHistogramChart({
  bins,
  height = 170,
}: {
  bins: number[];
  height?: number;
}) {
  const data = bins.map((value, index) => ({
    bin: `${index * 10}–${index * 10 + 10}%`,
    share: Math.round(value * 1000) / 10,
  }));
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 6, right: 6, left: -26, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="bin" {...axisProps} interval={1} />
          <YAxis {...axisProps} tickFormatter={(value: number) => `${value}%`} />
          <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${Number(value)}%`, "Share"]} />
          <Bar dataKey="share" radius={[3, 3, 0, 0]}>
            {data.map((entry, index) => (
              <Cell
                key={entry.bin}
                fill={index >= 7 ? "var(--primary)" : index >= 4 ? "var(--accent)" : "var(--warning)"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
