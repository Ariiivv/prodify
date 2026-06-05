# 🛠️ DEVELOPER CONFIGURATION & GUARDRAILS

## 1. Environment Guardrails (DO NOT IGNORE)
Any AI agent or developer interacting with this repository MUST respect the following environment constraints:

* **SECRET PROTECTION:** NEVER commit `.env` files. If this file is missing, request the user to provide the template structure, but never expose actual keys.
* **VIRTUAL ENVIRONMENTS:** The `/venv` or `/.venv` directories are strictly local. They MUST remain in `.gitignore`.
* **DATABASE FILES:** The `/prodify.db` (SQLite) is local development data only. It MUST remain in `.gitignore`.
* **DEPENDENCY INSTALLATION:** If a required dependency is missing, check `requirements.txt` first. Do not use `pip install` globally; use the virtual environment path: `./venv/bin/pip install <package>`.

## 2. File Inclusion Protocol
* **Source Code:** All active logic resides in `/backend` and `/frontend`.
* **Configuration:** All build-time settings reside in `tailwind.config.js`, `postcss.config.js`, and `main.py`.
* **Documentation:** Always consult `/docs/LATEST_HANDOFF.md` before starting a new task.

## 3. Git Workflow
* Every major milestone MUST be tagged using the format `Day-X`.
* Before committing, ensure the `.gitignore` has been consulted to avoid bloating the repository with system junk or compiled files.

## 4. COMMIT & TAG PROTOCOL
* **Regular Commits:** The agent must commit whenever a functional unit of work is completed (e.g., a full feature, a specific API endpoint, or a configuration change).
* **Major Milestone Tagging:** Once a planned day’s tasks are completed, the agent must present the "Day-X Summary" for my approval.
* **Collaboration Request:** 1. The agent will summarize the day’s work.
    2. The agent will wait for my explicit confirmation before committing the final "Day-X" tag.
    3. The agent will perform the tag only after I have reviewed and approved the summary.

## 5. EXTERNAL SERVICES & ESCALATION PROTOCOL
As the AI agent, you must NEVER guess or mock critical infrastructure. If a task requires any of the following, you must **PAUSE AND ASK THE USER** for instructions or credentials:
* **Third-Party APIs:** If we need to integrate external services (e.g., Gemini API, OpenAI, Stripe, Email services), stop and ask the user to configure the `.env` file and provide the specific SDK/API version they want to use.
* **Database Migrations:** If a requested feature requires altering existing SQLAlchemy models (e.g., adding new columns or tables), present the proposed schema changes to the user for approval *before* writing the migration script.
* **Complex Logic/Blockers:** If you are stuck on a bug for more than 2 attempts, or if the logic requires subjective product decisions, stop and explain the trade-offs to the user so they can make the final call.