export interface UserCredentials {
  id?: string;
  password: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  email: string;
}

export interface RegisterRequest {
  id?: string;
  password: string;
  first_name: string;
  last_name: string;
  phone_number: string;
  email: string;
}

export interface AuthResponse {
  id: string;
  first_name: string;
  last_name: string;
  phone_number: string;
  email: string;
}
