import { createTestPeer } from "../factories/user.factory";

export function createConnectionServiceDependencyMocks() {
	const tcpServerAdapter = {
		start: jest.fn(),
		stop: jest.fn(),
		on: jest.fn(),
		removeAllListeners: jest.fn(),
	};

	const networkConfig = {
		port: 8080,
		ipAddress: "192.168.1.100",
	};

	const userStore = {
		user: createTestPeer({
			id: "test-user-id",
			username: "testuser",
			isOnline: true,
		}),
		isGuest: false,
	};

	const tcpClientAdapter = {
		connect: jest.fn(),
		disconnect: jest.fn(),
		sendMessage: jest.fn(),
		isConnected: true,
		removeAllListeners: jest.fn(),
	};

	const webrtcAdapter = {
		createOffer: jest.fn(),
		handleOffer: jest.fn(),
		handleAnswer: jest.fn(),
		addIceCandidate: jest.fn(),
		sendDataMessage: jest.fn(),
		initializeLocalStream: jest.fn(),
		terminateCall: jest.fn(),
		toggleMic: jest.fn(),
		toggleCamera: jest.fn(),
		getLocalStream: jest.fn(),
		cleanup: jest.fn(),
		isConnected: true,
		on: jest.fn(),
		once: jest.fn(),
		removeAllListeners: jest.fn(),
	};

	const wsSignalingAdapter = {
		on: jest.fn(),
		sendMessage: jest.fn(),
		disconnect: jest.fn(),
		isConnected: false,
	};

	const chatService = {
		handleIncomingChatMessage: jest.fn(),
		handleAckMessage: jest.fn(),
	};

	const appModeStore = {
		isTcpAllowed: jest.fn(() => true),
		isWebSocketAllowed: jest.fn(() => true),
		isZeroconfAllowed: jest.fn(() => true),
		getEffectiveMode: jest.fn(() => "auto"),
		isModeAllowed: jest.fn(() => true),
	};

	return {
		tcpServerAdapter,
		networkConfig,
		userStore,
		tcpClientAdapter,
		webrtcAdapter,
		wsSignalingAdapter,
		chatService,
		appModeStore,
	};
}

export function createDiscoveryServiceDependencyMocks() {
	const zeroconfAdapter = {
		on: jest.fn(),
		startScan: jest.fn(),
		stopScan: jest.fn(),
		publishService: jest.fn(),
		cleanUp: jest.fn(),
	};

	const sessionStore = {
		userId: "test-user-id",
		setUserId: jest.fn(),
	};

	const networkConfig = {
		port: 8080,
		ipAddress: "192.168.1.100",
	};

	const userStore = {
		user: createTestPeer({
			id: "test-user-id",
			username: "testuser",
			isOnline: true,
		}),
		setUser: jest.fn(),
		isGuest: false,
	};

	const peerService = {
		register: jest.fn(),
		markOffline: jest.fn(),
		markOnline: jest.fn(),
		getAllPeers: jest.fn(),
		findPeerById: jest.fn(),
		findDiscoveredPeerById: jest.fn(),
		createUser: jest.fn(),
		cleanUp: jest.fn(),
	};

	const chatService = {
		getAllNotSentMessageForPeer: jest.fn(),
		tryResendMessage: jest.fn(),
		handleIncomingChatMessage: jest.fn(),
		handleAckMessage: jest.fn(),
	};

	const appModeStore = {
		isTcpAllowed: jest.fn(() => true),
		isWebSocketAllowed: jest.fn(() => true),
		isZeroconfAllowed: jest.fn(() => true),
		getEffectiveMode: jest.fn(() => "auto"),
		isModeAllowed: jest.fn(() => true),
	};

	return {
		zeroconfAdapter,
		sessionStore,
		networkConfig,
		userStore,
		peerService,
		chatService,
		appModeStore,
	};
}

export function createCallServiceDependencyMocks() {
	const connectionService = {
		initializeStream: jest.fn(),
		renegotiate: jest.fn(),
		terminateCallConnection: jest.fn(),
		sendMessage: jest.fn(),
		toggleMic: jest.fn(),
		toggleCamera: jest.fn(),
		getLocalStream: jest.fn(),
		on: jest.fn(),
		emit: jest.fn(),
		connectToPeer: jest.fn(),
		sendChatMessage: jest.fn(),
		sendAckMessage: jest.fn(),
	};

	connectionService.on.mockImplementation(() => connectionService);

	const userStore = {
		user: createTestPeer({
			id: "test-user-id",
			username: "testuser",
			isOnline: true,
		}),
	};

	return {
		connectionService,
		userStore,
	};
}

export function createPeerRepositoryMock() {
	return {
		isPeerExist: jest.fn(),
		savePeer: jest.fn(),
		markPeerOnline: jest.fn(),
		markPeerOffline: jest.fn(),
		queryAllPeers: jest.fn(),
		queryPeerById: jest.fn(),
	};
}

export function createChatServiceDependencyMocks() {
	const connectionService = {
		connectToPeer: jest.fn(),
		sendChatMessage: jest.fn(),
		sendAckMessage: jest.fn(),
		sendMessage: jest.fn(),
		initializeStream: jest.fn(),
		terminateCallConnection: jest.fn(),
		toggleMic: jest.fn(),
		toggleCamera: jest.fn(),
		getLocalStream: jest.fn(),
		renegotiate: jest.fn(),
	};

	const conversationRepository = {
		isConversationExist: jest.fn(),
		queryConversationById: jest.fn(),
		saveConversation: jest.fn(),
		queryAllConversation: jest.fn(),
		getConversationDestroyOps: jest.fn(),
	};

	const conversationParticipantRepository = {
		isDirectConversationExists: jest.fn(),
		saveMultipleConversationParticipant: jest.fn(),
		queryPeerByChatId: jest.fn(),
		queryConversationByPeer: jest.fn(),
		queryAllParticipants: jest.fn(),
		getParticipantDestroyOps: jest.fn(),
	};

	const messageRepository = {
		saveMessage: jest.fn(),
		queryMessagesByConversation: jest.fn(),
		getAllMessageDestroyOps: jest.fn(),
	};

	const messageStatusRepository = {
		saveMessageStatus: jest.fn(),
		updateMessageStatusById: jest.fn(),
		updateMessageStatusByMessage: jest.fn(),
		queryMessageStatusByMessage: jest.fn(),
		queryAllStatuses: jest.fn(),
		queryNotSentByMessages: jest.fn(),
		getStatusDestroyOps: jest.fn(),
	};

	const peerService = {
		findPeerById: jest.fn(),
		findDiscoveredPeerById: jest.fn(),
	};

	const userStore = {
		user: {
			id: "test-user-id",
			username: "testuser",
		},
	};

	return {
		connectionService,
		conversationRepository,
		conversationParticipantRepository,
		messageRepository,
		messageStatusRepository,
		peerService,
		userStore,
	};
}
