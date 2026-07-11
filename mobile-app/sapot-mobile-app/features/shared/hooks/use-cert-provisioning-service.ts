import { hookLog } from "../core/utils/logger";
import { useMainContainer } from "./use-main-container";
hookLog.debug("[use-cert-provisioning-service] module loaded");

export function useCertProvisioningService() {
  return useMainContainer().certProvisioning;
}
