import { CRMRpcClient } from "./crm-rpc";
import { CRMCoreMixin } from "./crm-core";
import { CRMRealEstateMixin } from "./crm-real-estate";
import { CRMHRMixin } from "./crm-hr";
import { CRMAutoMixin } from "./crm-auto";

export class CRMLib extends CRMRpcClient {}
export interface CRMLib extends CRMCoreMixin, CRMRealEstateMixin, CRMHRMixin, CRMAutoMixin {}

Object.assign(
  CRMLib.prototype,
  CRMCoreMixin.prototype,
  CRMRealEstateMixin.prototype,
  CRMHRMixin.prototype,
  CRMAutoMixin.prototype,
);

export const crm = new CRMLib();

export * from "./crm.types";
