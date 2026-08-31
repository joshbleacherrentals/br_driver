import { QUACK_CHANCE, rollForQuack } from "@/utils/quack";

describe("rollForQuack", () => {
  it("shows the duck below the threshold", () => {
    expect(rollForQuack(() => 0)).toBe(true);
    expect(rollForQuack(() => QUACK_CHANCE - 0.001)).toBe(true);
  });

  it("hides it at and above the threshold", () => {
    expect(rollForQuack(() => QUACK_CHANCE)).toBe(false);
    expect(rollForQuack(() => 0.5)).toBe(false);
    expect(rollForQuack(() => 0.999)).toBe(false);
  });

  it("lands near the stated rate over many rolls", () => {
    let seed = 1;
    const lcg = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const hits = Array.from({ length: 20000 }, () => rollForQuack(lcg)).filter(
      Boolean,
    ).length;
    expect(hits / 20000).toBeGreaterThan(QUACK_CHANCE * 0.8);
    expect(hits / 20000).toBeLessThan(QUACK_CHANCE * 1.2);
  });

  it("defaults to Math.random when no source is given", () => {
    expect(typeof rollForQuack()).toBe("boolean");
  });
});
