#!/usr/bin/env ruby
# frozen_string_literal: true

# Regenerate postman/sapot-api.postman_collection.json from docs/api/openapi/*.yaml.
#
# docs/api/openapi/*.yaml is the source of truth (generated from the live FastAPI
# app by scripts/generate_openapi_docs.py, drift-checked in CI). This script merges
# those 12 fragments into a single OpenAPI document -- tagging every operation with
# its fragment name so the Postman converter groups requests into matching folders
# -- then hands that off to `openapi-to-postmanv2` to produce the collection.
#
# Requires: Ruby stdlib only, plus `npx` (Node) to run openapi-to-postmanv2.
#
# Usage:
#   ruby scripts/generate_postman_collection.rb

require "yaml"
require "json"
require "fileutils"
require "digest"
require "open3"
require "tmpdir"

REPO_ROOT = File.expand_path("..", __dir__)
OPENAPI_DIR = File.join(REPO_ROOT, "docs", "api", "openapi")
POSTMAN_DIR = File.join(REPO_ROOT, "postman")
COLLECTION_PATH = File.join(POSTMAN_DIR, "sapot-api.postman_collection.json")

def merge_openapi_fragments
  merged = nil

  Dir.glob(File.join(OPENAPI_DIR, "*.yaml")).sort.each do |path|
    fragment_name = File.basename(path, ".yaml")
    spec = YAML.safe_load(File.read(path))

    (spec["paths"] || {}).each_value do |methods|
      methods.each_value do |operation|
        next unless operation.is_a?(Hash)

        operation["tags"] = [fragment_name]
      end
    end

    if merged.nil?
      merged = spec
    else
      merged["paths"] ||= {}
      merged["paths"].merge!(spec["paths"] || {})

      merged["components"] ||= {}
      (spec["components"] || {}).each do |kind, definitions|
        merged["components"][kind] ||= {}
        merged["components"][kind].merge!(definitions)
      end
    end
  end

  merged["info"]["title"] = "SAPOT API"
  merged["info"].delete("description")
  merged
end

# `openapi-to-postmanv2` assigns a fresh UUID to every collection/folder/request
# on each run, which makes the checked-in JSON churn on every regeneration even
# when nothing changed. Replace them with UUIDv5-style values (deterministic,
# derived from stable identity: title/name/method+path) so re-exports diff cleanly.
def stabilize_ids!(node, path = "root")
  case node
  when Hash
    if node.key?("_postman_id") || node.key?("id")
      identity = node["name"] || path
      stable_id = Digest::MD5.hexdigest("sapot-postman:#{path}:#{identity}")
      node["_postman_id"] = stable_id if node.key?("_postman_id")
      node["id"] = stable_id if node.key?("id")
    end

    node.each { |key, value| stabilize_ids!(value, "#{path}/#{key}") }
  when Array
    node.each_with_index { |value, index| stabilize_ids!(value, "#{path}[#{index}]") }
  end
end

def main
  FileUtils.mkdir_p(POSTMAN_DIR)

  merged_spec = merge_openapi_fragments
  merged_json_path = File.join(Dir.tmpdir, "sapot-openapi-merged.json")
  File.write(merged_json_path, JSON.pretty_generate(merged_spec))

  # Group requests into folders by the fragment tag (matching docs/api/openapi/*.yaml
  # groupings), not the default per-path-segment layout.
  options_config_path = File.join(Dir.tmpdir, "sapot-openapi-postman-options.json")
  File.write(options_config_path, JSON.generate({ folderStrategy: "Tags" }))

  stdout, stderr, status = Open3.capture3(
    "npx", "--yes", "openapi-to-postmanv2",
    "-s", merged_json_path,
    "-o", COLLECTION_PATH,
    "-c", options_config_path,
    "-p"
  )
  unless status.success?
    warn stdout
    warn stderr
    abort "openapi-to-postmanv2 failed"
  end

  collection = JSON.parse(File.read(COLLECTION_PATH))
  stabilize_ids!(collection)

  # Let every request inherit a bearer token from the active environment instead
  # of requiring per-request auth setup (token obtained via /auth/login, see README).
  collection["auth"] = {
    "type" => "bearer",
    "bearer" => [{ "key" => "token", "value" => "{{token}}", "type" => "string" }]
  }

  File.write(COLLECTION_PATH, "#{JSON.pretty_generate(collection)}\n")

  puts "Wrote #{COLLECTION_PATH}"
ensure
  File.delete(merged_json_path) if merged_json_path && File.exist?(merged_json_path)
  File.delete(options_config_path) if options_config_path && File.exist?(options_config_path)
end

main if __FILE__ == $PROGRAM_NAME
