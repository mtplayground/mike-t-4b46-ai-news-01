import { describe, expect, it } from "vitest";
import {
  getPageFromSearchParams,
  getPagination,
  POSTS_PER_PAGE,
} from "@/lib/pagination";

describe("pagination helpers", () => {
  it("uses 20 posts per page", () => {
    expect(POSTS_PER_PAGE).toBe(20);
  });

  it("parses page from URLSearchParams", () => {
    expect(getPageFromSearchParams(new URLSearchParams("page=3"))).toBe(3);
  });

  it("parses the first page value from object search params", () => {
    expect(getPageFromSearchParams({ page: ["4", "5"] })).toBe(4);
  });

  it("defaults missing or invalid page values to page 1", () => {
    expect(getPageFromSearchParams(undefined)).toBe(1);
    expect(getPageFromSearchParams({})).toBe(1);
    expect(getPageFromSearchParams({ page: "" })).toBe(1);
    expect(getPageFromSearchParams({ page: "0" })).toBe(1);
    expect(getPageFromSearchParams({ page: "-2" })).toBe(1);
    expect(getPageFromSearchParams({ page: "1.5" })).toBe(1);
    expect(getPageFromSearchParams({ page: "abc" })).toBe(1);
  });

  it("returns Prisma skip/take values for safe page numbers", () => {
    expect(getPagination(1)).toEqual({ skip: 0, take: POSTS_PER_PAGE });
    expect(getPagination(2)).toEqual({ skip: 20, take: POSTS_PER_PAGE });
    expect(getPagination(5)).toEqual({ skip: 80, take: POSTS_PER_PAGE });
  });

  it("defaults invalid pagination inputs to the first page", () => {
    expect(getPagination(0)).toEqual({ skip: 0, take: POSTS_PER_PAGE });
    expect(getPagination(-1)).toEqual({ skip: 0, take: POSTS_PER_PAGE });
    expect(getPagination(1.5)).toEqual({ skip: 0, take: POSTS_PER_PAGE });
    expect(getPagination(Number.NaN)).toEqual({
      skip: 0,
      take: POSTS_PER_PAGE,
    });
  });
});
