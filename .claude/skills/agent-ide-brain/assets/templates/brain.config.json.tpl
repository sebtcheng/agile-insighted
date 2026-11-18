{
  "tools": [
    "claude",
    "codex",
    "gemini"
  ],
  "mode": "update",
  "commands": {
    "tier1": "{{tier1Command}}",
    "tier2": "{{tier2Command}}"
  },
  "maxToolCalls": 300,
  "localDbHosts": [
    "localhost",
    "127.0.0.1",
    "::1"
  ],
  "protectedHosts": [],
  "allowInstall": false,
  "optionalModules": {
    "ciWorkflow": true,
    "preCommit": false,
    "devcontainer": false,
    "codeKnowledgeGraph": false
  },
  "repoName": "{{repoName}}",
  "packageScope": "{{packageScope}}"
}
