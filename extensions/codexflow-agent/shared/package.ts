import { publisher, name, version } from "../package.json"

// These ENV variables can be defined by ESBuild when building the extension
// in order to override the values in package.json. This allows us to build
// different extension variants with the same package.json file.
// The build process still needs to emit a modified package.json for consumption
// by VSCode, but that build artifact is not used during the transpile step of
// the build, so we still need this override mechanism.

// CodexFlow: Command prefix için kısa isim kullan
// package.json name: "codexflow-agent" 
// Command prefix: "codexflow" (daha kısa ve temiz)
const COMMAND_PREFIX = "codexflow"

export const Package = {
	publisher,
	name: process.env.PKG_NAME || COMMAND_PREFIX, // Komutlar için kısa isim
	fullName: name, // Tam paket adı
	version: process.env.PKG_VERSION || version,
	outputChannel: process.env.PKG_OUTPUT_CHANNEL || "CodexFlow Agent",
	sha: process.env.PKG_SHA,
} as const

