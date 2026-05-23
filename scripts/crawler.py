"""
CP 数据采集脚本
从 Codeforces API 和 AtCoder 页面抓取 Rating、做题记录、比赛信息
输出 JSON 到 public/data/ 目录供 Next.js 静态生成
"""
import json
import os
import time
import sys
import requests
from bs4 import BeautifulSoup
from datetime import datetime, timedelta

# 输出目录
OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "public", "data")

# API 地址
CF_API_USER = "https://codeforces.com/api/user.info?handles={}"
CF_API_STATUS = "https://codeforces.com/api/user.status?handle={}&from=1&count=200"
CF_API_CONTESTS = "https://codeforces.com/api/contest.list"
ATC_USER_PAGE = "https://atcoder.jp/users/{}"
ATC_HISTORY_API = "https://atcoder.jp/users/{}/history/json"
ATC_CONTESTS_PAGE = "https://atcoder.jp/contests/"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
}

# ============================================================
# Codeforces
# ============================================================

def fetch_cf_rating(username: str) -> dict:
    """获取 CF Rating 信息"""
    resp = requests.get(CF_API_USER.format(username), headers=HEADERS, timeout=30)
    data = resp.json()
    if data["status"] != "OK" or not data["result"]:
        raise RuntimeError(f"CF user not found: {username}")

    user = data["result"][0]
    return {
        "handle": user["handle"],
        "rating": user.get("rating", 0),
        "rank": user.get("rank", "unrated"),
        "max_rating": user.get("maxRating", 0),
        "max_rank": user.get("maxRank", "unrated"),
    }


def fetch_cf_rating_history(username: str) -> list:
    """获取 CF Rating 变化历史"""
    resp = requests.get(
        f"https://codeforces.com/api/user.rating?handle={username}",
        headers=HEADERS,
        timeout=30,
    )
    data = resp.json()
    if data["status"] != "OK":
        return []

    history = []
    for item in data["result"]:
        ts = item["ratingUpdateTimeSeconds"]
        date_str = datetime.utcfromtimestamp(ts).strftime("%Y-%m")
        history.append({"date": date_str, "rating": item["newRating"]})

    # 按月取最高值，取最近 6 个月
    monthly = {}
    for h in history:
        if h["date"] not in monthly or h["rating"] > monthly[h["date"]]:
            monthly[h["date"]] = h["rating"]
    result = [{"date": k, "rating": v} for k, v in sorted(monthly.items())]
    return result[-6:] if len(result) > 6 else result


def fetch_cf_submissions(username: str, days: int = 30) -> list:
    """获取 CF 最近的提交记录（只取 AC 的）"""
    resp = requests.get(CF_API_STATUS.format(username), headers=HEADERS, timeout=30)
    data = resp.json()
    if data["status"] != "OK":
        return []

    cutoff = datetime.utcnow() - timedelta(days=days)
    submissions = []

    for sub in data["result"]:
        ts = sub["creationTimeSeconds"]
        sub_time = datetime.utcfromtimestamp(ts)
        if sub_time < cutoff:
            continue

        prob = sub.get("problem", {})
        tags = prob.get("tags", [])
        # 翻译部分常用算法标签
        tag_map = {
            "greedy": "贪心", "dp": "动态规划", "graphs": "图论",
            "math": "数学", "data structures": "数据结构",
            "binary search": "二分", "sortings": "排序",
            "strings": "字符串", "number theory": "数论",
            "combinatorics": "组合数学", "constructive algorithms": "构造",
            "two pointers": "双指针", "brute force": "暴力",
            "implementation": "实现", "bitmasks": "位运算",
            "trees": "树", "dfs and similar": "DFS",
            "geometry": "计算几何", "shortest paths": "最短路",
            "probabilities": "概率论", "hashing": "哈希",
            "divide and conquer": "分治",
        }
        translated_tags = [tag_map.get(t, t) for t in tags]

        verdict_map = {"OK": "AC", "WRONG_ANSWER": "WA", "TIME_LIMIT_EXCEEDED": "TLE",
                       "MEMORY_LIMIT_EXCEEDED": "MLE", "RUNTIME_ERROR": "RE",
                       "COMPILATION_ERROR": "CE"}
        verdict = verdict_map.get(sub.get("verdict", ""), sub.get("verdict", "?"))

        submissions.append({
            "date": sub_time.strftime("%Y-%m-%d"),
            "problem_id": f"{prob.get('contestId', '')}{prob.get('index', '')}",
            "problem_name": prob.get("name", ""),
            "problem_url": f"https://codeforces.com/problemset/problem/{prob.get('contestId', '')}/{prob.get('index', '')}",
            "tags": translated_tags,
            "rating": prob.get("rating", 0),
            "time": sub_time.strftime("%H:%M"),
            "language": sub.get("programmingLanguage", ""),
            "verdict": verdict,
            "platform": "CF",
        })

    return submissions


def fetch_cf_contests() -> list:
    """获取 CF 即将举办的比赛"""
    resp = requests.get(CF_API_CONTESTS, headers=HEADERS, timeout=30)
    data = resp.json()
    if data["status"] != "OK":
        return []

    now = time.time()
    upcoming = []
    for c in data["result"]:
        if c["phase"] == "BEFORE":
            start_time = datetime.utcfromtimestamp(c["startTimeSeconds"])
            duration = c["durationSeconds"]
            upcoming.append({
                "name": c["name"],
                "date": start_time.strftime("%Y-%m-%d"),
                "time": start_time.strftime("%H:%M"),
                "duration": f"{duration // 3600}:{(duration % 3600) // 60:02d}",
                "platform": "Codeforces",
                "url": f"https://codeforces.com/contests/{c['id']}",
            })

    return upcoming[:5]


# ============================================================
# AtCoder
# ============================================================

def fetch_atc_rating(username: str) -> dict:
    """从 AtCoder 页面抓取 Rating"""
    resp = requests.get(ATC_USER_PAGE.format(username), headers=HEADERS, timeout=30)
    soup = BeautifulSoup(resp.text, "html.parser")

    rating = 0
    rank = "unrated"
    max_rating = 0
    max_rank = "unrated"

    # Rating 数字在 class="username" 后面的 span 里
    rating_span = soup.select_one("table.dl-table tr td span")
    if rating_span:
        try:
            rating = int(rating_span.text.strip())
        except ValueError:
            pass

    # 段位颜色等级
    atc_ranks = [
        (400, "灰"),
        (800, "棕"),
        (1200, "绿"),
        (1600, "水"),
        (2000, "蓝"),
        (2400, "黄"),
        (2800, "橙"),
        (float("inf"), "红"),
    ]
    for threshold, name in atc_ranks:
        if rating < threshold:
            rank = name
            break

    # 最高 Rating
    for th, name in atc_ranks:
        if max_rating < th:
            max_rank = name
            break

    return {
        "handle": username,
        "rating": rating,
        "rank": rank,
        "max_rating": max_rating,
        "max_rank": max_rank,
    }


def fetch_atc_rating_history(username: str) -> list:
    """获取 AtCoder Rating 历史"""
    try:
        resp = requests.get(ATC_HISTORY_API.format(username), headers=HEADERS, timeout=30)
        data = resp.json()
        monthly = {}
        for item in data:
            date_str = item["EndTime"][:7]  # "2024-05-11" -> "2024-05"
            rating = item["NewRating"]
            if date_str not in monthly or rating > monthly[date_str]:
                monthly[date_str] = rating
        result = [{"date": k, "rating": v} for k, v in sorted(monthly.items())]
        return result[-6:] if len(result) > 6 else result
    except Exception:
        return []


def fetch_atc_submissions(username: str, days: int = 30) -> list:
    """获取 AtCoder 最近的提交"""
    submissions = []
    cutoff = datetime.now() - timedelta(days=days)

    try:
        resp = requests.get(
            f"https://atcoder.jp/users/{username}/history",
            headers=HEADERS,
            timeout=30,
        )
        soup = BeautifulSoup(resp.text, "html.parser")

        # AtCoder submission page uses a table
        table = soup.select_one("table")
        if not table:
            return []

        rows = table.select("tbody tr")
        for row in rows:
            cols = row.select("td")
            if len(cols) < 6:
                continue

            date_cell = cols[0]
            contest_cell = cols[1]
            problem_cell = cols[2]
            lang_cell = cols[3]
            verdict_cell = cols[4]
            score_cell = cols[5] if len(cols) > 5 else None

            # Date
            date_link = date_cell.select_one("a")
            if not date_link:
                continue
            date_str = date_link.text.strip()
            date_obj = datetime.strptime(date_str, "%Y-%m-%d %H:%M:%S")
            if date_obj < cutoff:
                continue
            time_str = date_obj.strftime("%H:%M")

            # Problem
            prob_link = problem_cell.select_one("a")
            if not prob_link:
                continue
            problem_name = prob_link.text.strip()
            problem_url = "https://atcoder.jp" + prob_link.get("href", "")

            # Verdict
            verdict_text = verdict_cell.text.strip()
            verdict = "AC" if verdict_text == "AC" else verdict_text[:3]

            # Score
            score = 0
            if score_cell:
                try:
                    score = int(score_cell.text.strip())
                except ValueError:
                    pass

            # Language
            language = lang_cell.text.strip()

            # Extract tags from problem name
            task_id = problem_name.split(" - ")[0] if " - " in problem_name else problem_name

            submissions.append({
                "date": date_obj.strftime("%Y-%m-%d"),
                "problem_id": task_id,
                "problem_name": problem_name,
                "problem_url": problem_url,
                "tags": ["算法"],  # AtCoder doesn't have explicit tags
                "rating": score // 100 if score > 0 else 0,  # rough estimate
                "time": time_str,
                "language": language,
                "verdict": verdict,
                "platform": "AtC",
            })
    except Exception as e:
        print(f"[AtC] 获取提交记录失败: {e}", file=sys.stderr)

    return submissions


def fetch_atc_contests() -> list:
    """获取 AtCoder 即将举办的比赛"""
    try:
        resp = requests.get(ATC_CONTESTS_PAGE, headers=HEADERS, timeout=30)
        soup = BeautifulSoup(resp.text, "html.parser")

        upcoming = []
        now = datetime.now()

        for table_id in ["contest-table-upcoming", "contest-table-action"]:
            table = soup.select_one(f"#{table_id}")
            if not table:
                continue

            rows = table.select("tbody tr")
            for row in rows:
                cols = row.select("td")
                if len(cols) < 2:
                    continue

                # 时间
                time_link = cols[0].select_one("a")
                if not time_link:
                    continue
                time_text = time_link.text.strip()

                # 解析时间: "2026-05-25 21:00:00+0900"
                try:
                    start_time = datetime.strptime(time_text[:19], "%Y-%m-%d %H:%M:%S")
                except ValueError:
                    continue
                if start_time < now:
                    continue

                # 名称
                name_link = cols[1].select_one("a")
                if not name_link:
                    continue
                name = name_link.text.strip()
                url = "https://atcoder.jp" + name_link.get("href", "")

                # Duration
                duration = "1:40"
                if len(cols) >= 3:
                    dur_text = cols[2].text.strip()
                    if ":" in dur_text:
                        duration = dur_text

                upcoming.append({
                    "name": name,
                    "date": start_time.strftime("%Y-%m-%d"),
                    "time": start_time.strftime("%H:%M"),
                    "duration": duration,
                    "platform": "AtCoder",
                    "url": url,
                })

        return upcoming[:5]
    except Exception as e:
        print(f"[AtC] 获取比赛失败: {e}", file=sys.stderr)
        return []


# ============================================================
# 汇总输出
# ============================================================

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    config_path = os.path.join(script_dir, "config.json")

    # 读取配置
    cf_username = os.environ.get("CF_USERNAME")
    atc_username = os.environ.get("ATC_USERNAME")

    if not cf_username or not atc_username:
        if os.path.exists(config_path):
            with open(config_path, "r", encoding="utf-8") as f:
                config = json.load(f)
            cf_username = cf_username or config.get("cf_username", "tourist")
            atc_username = atc_username or config.get("atc_username", "tourist")
        else:
            cf_username = cf_username or "tourist"
            atc_username = atc_username or "tourist"

    print(f"[INFO] CF: {cf_username}  ATC: {atc_username}")

    os.makedirs(OUT_DIR, exist_ok=True)

    # ---- CF Rating ----
    print("[CF] 获取 Rating...")
    try:
        cf_rating = fetch_cf_rating(cf_username)
        cf_history = fetch_cf_rating_history(cf_username)
        cf_rating["history"] = cf_history
        with open(os.path.join(OUT_DIR, "cf-rating.json"), "w", encoding="utf-8") as f:
            json.dump(cf_rating, f, ensure_ascii=False, indent=2)
        print(f"[CF] Rating: {cf_rating['rating']} ({cf_rating['rank']})")
    except Exception as e:
        print(f"[CF] Rating 失败: {e}", file=sys.stderr)

    # ---- ATC Rating ----
    print("[AtC] 获取 Rating...")
    try:
        atc_rating = fetch_atc_rating(atc_username)
        atc_history = fetch_atc_rating_history(atc_username)
        atc_rating["history"] = atc_history
        with open(os.path.join(OUT_DIR, "atc-rating.json"), "w", encoding="utf-8") as f:
            json.dump(atc_rating, f, ensure_ascii=False, indent=2)
        print(f"[AtC] Rating: {atc_rating['rating']} ({atc_rating['rank']})")
    except Exception as e:
        print(f"[AtC] Rating 失败: {e}", file=sys.stderr)

    # ---- CF Submissions ----
    print("[CF] 获取提交记录...")
    try:
        cf_subs = fetch_cf_submissions(cf_username)
        # 按日期分组
        cf_grouped = {}
        for s in cf_subs:
            d = s.pop("date")
            s.pop("platform")
            if d not in cf_grouped:
                cf_grouped[d] = []
            cf_grouped[d].append(s)
        with open(os.path.join(OUT_DIR, "cf-submissions.json"), "w", encoding="utf-8") as f:
            json.dump(cf_grouped, f, ensure_ascii=False, indent=2)
        print(f"[CF] {len(cf_subs)} 条提交")
    except Exception as e:
        print(f"[CF] 提交失败: {e}", file=sys.stderr)

    # ---- ATC Submissions ----
    print("[AtC] 获取提交记录...")
    try:
        atc_subs = fetch_atc_submissions(atc_username)
        atc_grouped = {}
        for s in atc_subs:
            d = s.pop("date")
            s.pop("platform")
            if d not in atc_grouped:
                atc_grouped[d] = []
            atc_grouped[d].append(s)
        with open(os.path.join(OUT_DIR, "atc-submissions.json"), "w", encoding="utf-8") as f:
            json.dump(atc_grouped, f, ensure_ascii=False, indent=2)
        print(f"[AtC] {len(atc_subs)} 条提交")
    except Exception as e:
        print(f"[AtC] 提交失败: {e}", file=sys.stderr)

    # ---- Contests ----
    print("[CF] 获取比赛...")
    try:
        cf_contests = fetch_cf_contests()
    except Exception as e:
        print(f"[CF] 比赛失败: {e}", file=sys.stderr)
        cf_contests = []

    print("[AtC] 获取比赛...")
    try:
        atc_contests = fetch_atc_contests()
    except Exception as e:
        print(f"[AtC] 比赛失败: {e}", file=sys.stderr)
        atc_contests = []

    contests = {
        "cf_contests": cf_contests,
        "atc_contests": atc_contests,
    }
    with open(os.path.join(OUT_DIR, "contests.json"), "w", encoding="utf-8") as f:
        json.dump(contests, f, ensure_ascii=False, indent=2)
    print(f"[Contests] CF: {len(cf_contests)}  AtC: {len(atc_contests)}")

    # ---- 摘要 ----
    print("\n===== 采集完成 =====")
    print(f"CF: {os.path.join(OUT_DIR, 'cf-rating.json')}")
    print(f"AtC: {os.path.join(OUT_DIR, 'atc-rating.json')}")
    print(f"Submissions: {os.path.join(OUT_DIR, 'cf-submissions.json')}, {os.path.join(OUT_DIR, 'atc-submissions.json')}")
    print(f"Contests: {os.path.join(OUT_DIR, 'contests.json')}")


if __name__ == "__main__":
    main()