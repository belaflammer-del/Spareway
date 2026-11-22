import { describe, expect, it } from "vitest";
import { layoutLanes } from "@/lib/calendar-layout";

describe("layoutLanes", () => {
  it("lässt nicht überlappende Termine in voller Breite", () => {
    const r = layoutLanes([{ id: "a", start: 8, end: 10 }, { id: "b", start: 10, end: 12 }]);
    expect(r.map((x) => [x.id, x.lane, x.lanes])).toEqual([["a", 0, 1], ["b", 0, 1]]);
  });
  it("legt überlappende Termine nebeneinander", () => {
    const r = layoutLanes([{ id: "a", start: 7.5, end: 10 }, { id: "b", start: 8.5, end: 11 }, { id: "c", start: 10, end: 13 }]);
    const m = Object.fromEntries(r.map((x) => [x.id, [x.lane, x.lanes]]));
    expect(m).toEqual({ a: [0, 2], b: [1, 2], c: [0, 2] }); // c nutzt die frei gewordene Spur von a
  });
  it("trennt unabhängige Gruppen", () => {
    const r = layoutLanes([{ id: "a", start: 8, end: 9 }, { id: "b", start: 8, end: 9 }, { id: "c", start: 14, end: 15 }]);
    expect(r.find((x) => x.id === "c")).toMatchObject({ lane: 0, lanes: 1 });
    expect(r.find((x) => x.id === "b")).toMatchObject({ lanes: 2 });
  });
});
