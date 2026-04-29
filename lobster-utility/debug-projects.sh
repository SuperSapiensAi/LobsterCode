#!/bin/bash
# Debug script: mostra PERCHÉ ogni cartella viene rilevata come progetto
# Esegui con: bash debug-projects.sh

echo "=== ANALISI CARTELLE DESKTOP ==="
echo ""

MARKERS=(
  "docker-compose.yml" "docker-compose.yaml" "compose.yml" "compose.yaml"
  "package.json"
  "requirements.txt" "pyproject.toml" "setup.py" "Pipfile" "poetry.lock" "environment.yml"
  "Cargo.toml"
  "go.mod" "go.sum"
  "pom.xml" "build.gradle" "build.gradle.kts" "settings.gradle" "settings.gradle.kts"
  "global.json" "Directory.Build.props"
  "composer.json" "artisan" "wp-config.php"
  "Gemfile" "Rakefile" "config.ru"
  "Package.swift"
  "pubspec.yaml"
  "mix.exs"
  "main.tf" "terraform.tf"
  "CMakeLists.txt" "meson.build" "configure.ac"
  "Makefile"
  ".lobster.json"
)

GLOB_EXTS=(".sln" ".csproj" ".fsproj" ".xcodeproj" ".xcworkspace")

for scandir in ~/Desktop ~/Documents ~/Code ~/Projects ~/Developer ~/Sites ~/dev ~/Repos ~/repos ~/workspace; do
  [ ! -d "$scandir" ] && continue

  for dir in "$scandir"/*/; do
    [ ! -d "$dir" ] && continue
    name=$(basename "$dir")
    found=""

    for marker in "${MARKERS[@]}"; do
      if [ -f "$dir/$marker" ]; then
        found="$found $marker"
      fi
    done

    for ext in "${GLOB_EXTS[@]}"; do
      match=$(find "$dir" -maxdepth 1 -name "*$ext" 2>/dev/null | head -1)
      if [ -n "$match" ]; then
        found="$found *$ext($(basename "$match"))"
      fi
    done

    has_git="NO"
    [ -d "$dir/.git" ] && has_git="YES"

    if [ -n "$found" ]; then
      echo "✅ $name: MARKERS=$found | git=$has_git"
      # If package.json found, show if it has code signals
      if [ -f "$dir/package.json" ]; then
        has_deps=$(python3 -c "
import json
try:
    p=json.load(open('$dir/package.json'))
    signals=[]
    if p.get('dependencies'): signals.append('deps:'+str(len(p['dependencies'])))
    if p.get('devDependencies'): signals.append('devDeps:'+str(len(p['devDependencies'])))
    if p.get('scripts'): signals.append('scripts:'+str(len(p['scripts'])))
    if p.get('main'): signals.append('main')
    if p.get('bin'): signals.append('bin')
    print(' '.join(signals) if signals else 'EMPTY/NO-CODE-SIGNALS')
except: print('INVALID-JSON')
" 2>/dev/null)
        echo "   └── package.json signals: $has_deps"
      fi
    else
      if [ "$has_git" = "YES" ]; then
        echo "⏭️  $name: git=YES but NO markers → SHOULD BE SKIPPED"
      fi
    fi
  done
done

echo ""
echo "=== FINE ANALISI ==="
