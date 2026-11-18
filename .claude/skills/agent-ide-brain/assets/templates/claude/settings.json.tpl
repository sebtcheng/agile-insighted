{
  "permissions": {
    "deny": [
      "Read(./.env*)",
      "Read(./**/.env*)",
      "Read(**/.env*)",
      "Read(**/secrets/**)",
      "Edit(./.env*)",
      "Edit(./**/.env*)",
      "Write(./.env*)",
      "Write(./**/.env*)"
    ],
    "ask": [
      "Bash(ssh *)",
      "Bash(scp *)",
      "Bash(rsync *)",
      "Bash(git push --force*)",
      "Bash(git reset --hard*)",
      "Bash(npm publish*)"
    ],
    "allow": [
      "Read",
      "Edit",
      "Grep",
      "Bash({{commandPrefix}} run lint*)",
      "Bash({{commandPrefix}} run typecheck*)",
      "Bash({{commandPrefix}} run test:unit*)",
      "Bash({{commandPrefix}} run build*)",
      "Bash({{npxPrefix}} eslint*)",
      "Bash({{npxPrefix}} vitest*)"
    ]
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|Edit|Write|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "node .claude/hooks/pre-tool-guard.mjs",
            "timeout": 5
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "node .claude/hooks/post-edit-format.mjs",
            "timeout": 5
          }
        ]
      },
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node .claude/hooks/post-edit-format.mjs",
            "timeout": 5
          }
        ]
      }
    ],
    "PreCompact": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node .claude/hooks/pre-compact-save.mjs",
            "timeout": 5
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node .claude/hooks/session-start-restore.mjs",
            "timeout": 5
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node .claude/hooks/stop-gate.mjs",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
