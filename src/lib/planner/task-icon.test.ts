import assert from "node:assert/strict";
import test from "node:test";
import { iconIdForTitle } from "@/lib/planner/task-icon";

test("a title picks a specific icon", () => {
  assert.equal(iconIdForTitle("Ship package at UPS", "Home"), "package");
  assert.equal(iconIdForTitle("Get coolant", "Upkeep"), "car");
  assert.equal(iconIdForTitle("Pick up mom's eyeglasses", "Family"), "glasses");
  assert.equal(iconIdForTitle("Evening yoga", "Health"), "person-standing");
  assert.equal(iconIdForTitle("Meal prep for coop", "Family"), "utensils");
});

test("an unknown home task uses the category icon", () => {
  assert.equal(iconIdForTitle("Water the fern", "Home"), "house");
});

test("a saved icon wins over the title", () => {
  assert.equal(iconIdForTitle("Evening yoga", "Health", "bike"), "bike");
});
