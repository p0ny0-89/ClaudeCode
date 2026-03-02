# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This repository is currently empty. Update this file as the project grows to document build commands, architecture, and conventions.

## Git Workflow

**This is a required workflow for all work in this repository.**

The GitHub remote is: https://github.com/p0ny0-89/ClaudeCode

Commit and push after every meaningful unit of work (new feature, bug fix, refactor, config change) so progress is always saved and reversible.

- Use clean, descriptive commit messages in the imperative mood (e.g. `Add user auth`, `Fix pagination bug`)
- Stage specific files rather than `git add .` to avoid committing unintended changes
- Push immediately after every commit: `git push`
- Never batch unrelated changes into a single commit
