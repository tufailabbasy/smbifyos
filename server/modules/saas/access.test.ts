import test from "node:test";
import assert from "node:assert/strict";
import { PLAN_CATALOG, hasPermission, normalizePlan, normalizeRole } from "./access.js";
import { hashPassword, validatePassword, verifyPassword } from "../../utils/password.js";

test("role permissions enforce least privilege", () => {
  assert.equal(hasPermission("admin", "users.manage"), true);
  assert.equal(hasPermission("manager", "users.manage"), false);
  assert.equal(hasPermission("viewer", "leads.manage"), false);
  assert.equal(hasPermission("viewer", "leads.view"), true);
  assert.equal(hasPermission("super_admin", "platform.manage"), true);
});

test("platform role always resolves to super admin", () => {
  assert.equal(normalizeRole("viewer", "super_admin"), "super_admin");
  assert.equal(normalizeRole("unknown"), "viewer");
});

test("plans have increasing seats and protected automation", () => {
  assert.equal(normalizePlan("invalid"), "free");
  assert.equal(PLAN_CATALOG.free.limits.users, 1);
  assert.equal(PLAN_CATALOG.free.features.automation, false);
  assert.equal(PLAN_CATALOG.pro.features.automation, true);
  assert.equal(PLAN_CATALOG.enterprise.limits.users, -1);
});

test("password hashing validates secure credentials", () => {
  assert.ok(validatePassword("short"));
  const password = "SecureAgency2026!";
  assert.equal(validatePassword(password), null);
  const record = hashPassword(password);
  assert.equal(verifyPassword(password, record), true);
  assert.equal(verifyPassword("wrong-password", record), false);
});
