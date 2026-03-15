export interface CleanUpRepositoriesMocks {
  guestUserRepository: { getGuestUserDestroyOps: jest.Mock };
  peerRepository: { getPeerDestroyOps: jest.Mock };
  messageRepository: { getAllMessageDestroyOps: jest.Mock };
  messageStatusRepository: { getStatusDestroyOps: jest.Mock };
  conversationRepository: { getConversationDestroyOps: jest.Mock };
  conversationParticipantRepository: { getParticipantDestroyOps: jest.Mock };
}

export function createCleanUpRepositoriesMocks(
  overrides: Partial<CleanUpRepositoriesMocks> = {}
): CleanUpRepositoriesMocks {
  return {
    guestUserRepository: {
      getGuestUserDestroyOps: jest.fn(),
    },
    peerRepository: {
      getPeerDestroyOps: jest.fn(),
    },
    messageRepository: {
      getAllMessageDestroyOps: jest.fn(),
    },
    messageStatusRepository: {
      getStatusDestroyOps: jest.fn(),
    },
    conversationRepository: {
      getConversationDestroyOps: jest.fn(),
    },
    conversationParticipantRepository: {
      getParticipantDestroyOps: jest.fn(),
    },
    ...overrides,
  };
}
