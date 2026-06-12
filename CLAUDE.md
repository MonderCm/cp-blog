@AGENTS.md
# CLAUDE.md (global)

来自 [multica-ai/andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills)(MIT),
基于 Andrej Karpathy 对 LLM 写代码常见毛病的总结,稍作裁剪以适配本机偏好。

## 与本机偏好的关系(读这条最重要)

用户已开启 `bypassPermissions` 全自动模式,并要求**不要反复 AskUserQuestion 确认偏好/范围/方案选择**(详见 auto-memory `autonomous-mode`)。
所以下面 4 条原则按下列方式应用:

- 第 1 条 **Think Before Coding** 不要变成"凡事先问"。它的意思是:**在心里**显式过一遍假设、权衡、替代方案,挑最合理的默认方案直接做,把权衡写进给用户的汇报里。只有**真正不可逆 / 外向 / 安全相关**的分叉才停下来问。
- 第 2、3、4 条原样应用,优先级:**Surgical > Simplicity > Goal-Driven > Think**。
- 跟项目级 `AGENTS.md` / `CLAUDE.md` 冲突时,项目优先。

---

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, **pick the most reasonable default and say so**(本机改动:不是"就问",而是"挑+说明")。
- If multiple interpretations exist, name them in the report — don't pick silently *without acknowledging*。
- If a simpler approach exists, say so. Push back when warranted.
- 真正的安全/不可逆分叉才 stop & ask;其他情况选默认继续。

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: **Every changed line should trace directly to the user's request.**

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
