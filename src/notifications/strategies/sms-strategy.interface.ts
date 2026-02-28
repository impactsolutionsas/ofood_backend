export interface ISmsStrategy {
  sendSms(phone: string, message: string): Promise<void>;
}
