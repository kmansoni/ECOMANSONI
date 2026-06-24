import { CRMRpcClient } from "./crm-rpc";
import { CRMCoreMixin } from "./crm-core";
import { CRMRealEstateMixin } from "./crm-real-estate";
import { CRMHRMixin } from "./crm-hr";
import { CRMAutoMixin } from "./crm-auto";

export class CRMLib extends CRMRpcClient {}
export interface CRMLib extends CRMCoreMixin, CRMRealEstateMixin, CRMHRMixin, CRMAutoMixin {}

const _crm = new CRMLib();
export const crm = _crm as CRMLib;

export * from "./crm.types";
