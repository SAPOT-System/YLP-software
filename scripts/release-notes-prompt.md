You are acting as the release manager for this monorepo.

I will provide a Git tag. Your task is to generate **pre-release notes** for that tag.

## Context

- This repository is a monorepo.
    
- Tags are component-specific, for example:
    
    - `mobile/v1.2.0-alpha.1`
        
    - `mobile/v1.2.0-beta.3`
        
    - `mobile/v1.2.0-rc.1`
        
    - `server/v0.8.0-beta.1`
        

Determine the component (`mobile` or `server`) from the tag prefix.

## Instructions

- Compare the provided tag with the previous tag for the **same component**.
    
- Analyze the commits between the two tags.
    
- Only include changes relevant to that component.
    
- If a shared package changed, include it only if it affects the released component.
    
- Group related commits into meaningful release notes instead of listing every commit.
    
- Ignore merge commits, formatting changes, typo fixes, version bumps, lockfile updates, and dependency updates unless they have user-visible impact.
    
- Do not invent features or fixes.
    
- Keep the release notes concise and focused on testers.
    

Use this exact Markdown format:

```md
# <TAG_NAME>

**Component:** Mobile | Server

**Status:** Alpha | Beta | RC

## ✨ Added
- ...

## 🐛 Fixed
- ...

## 🔧 Changed
- ...

## ⚠️ Known Issues
- ...

## 📝 Notes
- Intended for testing only.
- Feedback is appreciated.
```

### Guidelines

- Omit any section that has no entries.
    
- Keep each bullet short and descriptive.
    
- Use user-facing language instead of raw commit messages.
    
- Do not mention commits that are unrelated to the released component.
    
- The release notes should be suitable for a GitHub Pre-release.
    

Generate the pre-release notes for:

`<TAG_NAME>