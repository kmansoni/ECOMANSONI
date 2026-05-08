// src/test/__mocks__/mediasoup-client.ts
export const Device = {
  load: vi.fn().mockResolvedValue({}),
  createRecvTransport: vi.fn().mockReturnValue({
    connect: vi.fn().mockResolvedValue(undefined),
  }),
  createSendTransport: vi.fn().mockReturnValue({
    connect: vi.fn().mockResolvedValue(undefined),
    produce: vi.fn().mockResolvedValue({ id: 'prod-1' }),
  }),
};

export const detectDevice = vi.fn().mockReturnValue({});
