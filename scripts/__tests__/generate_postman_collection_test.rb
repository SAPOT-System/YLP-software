# frozen_string_literal: true

require "minitest/autorun"
require_relative "../generate_postman_collection"

# Small stand-in for what openapi-to-postmanv2 emits: a collection whose
# top-level `item` array holds one folder per OpenAPI fragment, each folder
# holding request items. Using a fixture rather than the real converter keeps
# this test fast and offline (no `npx`, no network).
def sample_collection
  {
    "info" => {
      "_postman_id" => "aaaa",
      "name" => "SAPOT API",
      "schema" => "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
    },
    "item" => [
      {
        "name" => "admin",
        "item" => [
          { "id" => "r1", "name" => "Get My Admin Info", "request" => { "method" => "GET" } },
          { "id" => "r2", "name" => "Ban User", "request" => { "method" => "POST" } }
        ]
      },
      {
        "name" => "sync",
        "item" => [
          { "id" => "r3", "name" => "Pull Remote Changes", "request" => { "method" => "GET" } }
        ]
      }
    ],
    "event" => [],
    "variable" => [{ "key" => "baseUrl", "value" => "/" }],
    "auth" => {
      "type" => "bearer",
      "bearer" => [{ "key" => "token", "value" => "{{token}}", "type" => "string" }]
    }
  }
end

class SplitByFolderTest < Minitest::Test
  def test_produces_one_collection_per_folder_keyed_by_folder_name
    result = split_by_folder(sample_collection)

    assert_equal %w[admin sync], result.keys.sort
  end

  def test_hoists_the_folder_requests_to_top_level_item
    result = split_by_folder(sample_collection)

    assert_equal ["Get My Admin Info", "Ban User"], result["admin"]["item"].map { |i| i["name"] }
    assert_equal ["Pull Remote Changes"], result["sync"]["item"].map { |i| i["name"] }
  end

  def test_carries_auth_and_variables_into_every_split_collection
    result = split_by_folder(sample_collection)

    result.each_value do |collection|
      assert_equal "bearer", collection["auth"]["type"]
      assert_equal "{{token}}", collection["auth"]["bearer"].first["value"]
      assert_equal [{ "key" => "baseUrl", "value" => "/" }], collection["variable"]
    end
  end

  def test_gives_each_split_collection_a_distinct_deterministic_id_and_name
    first = split_by_folder(sample_collection)
    second = split_by_folder(sample_collection)

    refute_equal first["admin"]["info"]["_postman_id"], first["sync"]["info"]["_postman_id"]
    assert_equal first["admin"]["info"]["_postman_id"], second["admin"]["info"]["_postman_id"]
    assert_equal "SAPOT API - admin", first["admin"]["info"]["name"]
  end

  def test_does_not_mutate_the_input_collection
    input = sample_collection
    before = Marshal.dump(input)

    split_by_folder(input)

    assert_equal before, Marshal.dump(input)
  end

  def test_ignores_top_level_items_that_are_requests_rather_than_folders
    collection = sample_collection
    collection["item"] << { "id" => "loose", "name" => "Read Root", "request" => { "method" => "GET" } }

    result = split_by_folder(collection)

    assert_equal %w[admin sync], result.keys.sort
  end
end

class BaselineTestsTest < Minitest::Test
  def test_adds_a_test_listener_event_to_every_request
    result = with_baseline_tests(sample_collection)

    requests = result["item"].flat_map { |folder| folder["item"] }
    assert_equal 3, requests.length

    requests.each do |request|
      events = request["event"]
      refute_nil events, "#{request['name']} has no event array"

      test_events = events.select { |e| e["listen"] == "test" }
      assert_equal 1, test_events.length, "#{request['name']} should have exactly one test event"
      assert_equal "text/javascript", test_events.first["script"]["type"]
    end
  end

  def test_baseline_script_asserts_no_server_error_and_a_response_time_bound
    result = with_baseline_tests(sample_collection)
    script = result["item"].first["item"].first["event"].first["script"]["exec"].join("\n")

    assert_includes script, "pm.expect(pm.response.code).to.be.below(500)"
    assert_includes script, "pm.expect(pm.response.responseTime).to.be.below(5000)"
  end

  def test_script_exec_is_an_array_of_single_lines
    result = with_baseline_tests(sample_collection)
    exec = result["item"].first["item"].first["event"].first["script"]["exec"]

    assert_kind_of Array, exec
    exec.each { |line| refute_includes line, "\n" }
  end

  def test_does_not_mutate_the_input_collection
    input = sample_collection
    before = Marshal.dump(input)

    with_baseline_tests(input)

    assert_equal before, Marshal.dump(input)
  end

  def test_replaces_rather_than_duplicates_an_existing_baseline_event
    once = with_baseline_tests(sample_collection)
    twice = with_baseline_tests(once)

    request = twice["item"].first["item"].first
    assert_equal 1, request["event"].count { |e| e["listen"] == "test" }
  end
end

class StripItemAuthTest < Minitest::Test
  def test_removes_a_per_item_auth_block_so_collection_auth_can_take_over
    collection = sample_collection
    collection["item"].first["item"].first["request"]["auth"] = { "type" => "oauth2" }

    strip_item_auth!(collection["item"])

    refute collection["item"].first["item"].first["request"].key?("auth")
  end

  def test_leaves_requests_without_an_auth_block_untouched
    collection = sample_collection

    strip_item_auth!(collection["item"])

    collection["item"].each do |folder|
      folder["item"].each { |request| refute request["request"].key?("auth") }
    end
  end

  def test_removes_a_bare_null_auth_block
    collection = sample_collection
    collection["item"].first["item"].first["request"]["auth"] = nil

    strip_item_auth!(collection["item"])

    refute collection["item"].first["item"].first["request"].key?("auth")
  end

  def test_leaves_an_explicit_noauth_block_in_place
    collection = sample_collection
    collection["item"].first["item"].first["request"]["auth"] = { "type" => "noauth" }

    strip_item_auth!(collection["item"])

    assert_equal "noauth", collection["item"].first["item"].first["request"]["auth"]["type"]
  end
end
