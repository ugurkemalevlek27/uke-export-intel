import test from 'node:test';
import assert from 'node:assert/strict';
import {deliveryBlock} from '../src/lib/integrations/whatsapp-delivery-policy';
const now=new Date('2026-09-13T10:00:00Z');
const valid={enabled:true,allowed:true,aiAllowed:true,linkedUser:true,role:'super_admin',sameOrganization:false,suppressed:false,occurredAt:now,now,live:true,token:true,recipient:'905550000000',testRecipient:'905550000000'};
test('only explicitly configured primary admin test replies can be sent',()=>{
  assert.equal(deliveryBlock(valid),null);
  assert.equal(deliveryBlock({...valid,allowed:false}),'permission_revoked');
  assert.equal(deliveryBlock({...valid,linkedUser:false}),'permission_revoked');
  assert.equal(deliveryBlock({...valid,role:'viewer'}),'admin_test_only');
  assert.equal(deliveryBlock({...valid,suppressed:true}),'suppressed');
  assert.equal(deliveryBlock({...valid,live:false}),'configuration_required');
  assert.equal(deliveryBlock({...valid,token:false}),'configuration_required');
  assert.equal(deliveryBlock({...valid,testRecipient:'905559999999'}),'test_recipient_mismatch');
  assert.equal(deliveryBlock({...valid,occurredAt:new Date(now.getTime()-24*3600000)}),'reply_window_expired');
});
