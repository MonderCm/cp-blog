/**
 * 跨模块共享的类型定义
 */

export interface RatingData {
  handle: string;
  rating: number;
  rank: string;
  maxRating: number;
  maxRank: string;
  history: { date: string; rating: number }[];
}

export interface ProblemEntry {
  id: string;
  name: string;
  url: string;
  tags: string[];
  score: number;
  time: string;
  language: string;
  verdict: string;
}

export interface SubmissionDay {
  date: string;
  problems: ProblemEntry[];
}

export interface ContestEntry {
  name: string;
  date: string;
  time: string;
  duration: string;
  platform: string;
  url: string;
}

export interface PlatformBuckets<T> {
  cf: T;
  atc: T;
  nc: T;
}

/** 视奸对象(学习记录页人员行) */
export interface WatchTarget {
  id: string;
  nickname: string;
  cfHandle: string;
  atcHandle: string;
}
