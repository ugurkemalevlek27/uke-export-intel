import test from "node:test";
import assert from "node:assert/strict";
import { whatsappAccess } from "../src/lib/integrations/whatsapp-assistant";
test("only main admin may add; no WhatsApp role can update or delete", () => {
  for (const role of ["viewer","sales","manager","organization_admin","admin"]) {
    assert.deepEqual(whatsappAccess(role,true),{read:true,add:false,update:false,delete:false});
    assert.equal(whatsappAccess(role,false).read,false);
  }
  assert.deepEqual(whatsappAccess("super_admin",false),{read:true,add:true,update:false,delete:false});
});
