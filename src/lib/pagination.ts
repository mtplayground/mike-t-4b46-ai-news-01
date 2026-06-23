export const POSTS_PER_PAGE = 20;

type SearchParamValue = string | string[] | undefined;

export type PaginationSearchParams =
  | URLSearchParams
  | ReadonlyURLSearchParamsLike
  | Record<string, SearchParamValue>
  | null
  | undefined;

type ReadonlyURLSearchParamsLike = {
  get(name: string): string | null;
};

export type Pagination = {
  skip: number;
  take: number;
};

function firstSearchParamValue(
  searchParams: PaginationSearchParams,
  name: string,
): string | undefined {
  if (!searchParams) {
    return undefined;
  }

  if ("get" in searchParams && typeof searchParams.get === "function") {
    return searchParams.get(name) ?? undefined;
  }

  const value = (searchParams as Record<string, SearchParamValue>)[name];

  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export function getPageFromSearchParams(
  searchParams: PaginationSearchParams,
): number {
  const pageValue = firstSearchParamValue(searchParams, "page");

  if (!pageValue) {
    return 1;
  }

  const page = Number(pageValue);

  if (!Number.isSafeInteger(page) || page < 1) {
    return 1;
  }

  return page;
}

export function getPagination(page: number): Pagination {
  const safePage = Number.isSafeInteger(page) && page > 0 ? page : 1;

  return {
    skip: (safePage - 1) * POSTS_PER_PAGE,
    take: POSTS_PER_PAGE,
  };
}
