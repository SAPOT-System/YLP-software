import axios from "axios";
import { getApiUrl } from "@/config/runtime";

export const apiClient = axios.create({
  baseURL: getApiUrl(),
});