package com.andrew.app.bridge.v3

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.MessageDigest
import java.security.PrivateKey
import java.security.Signature

class DeviceKeyStoreSigner(
    private val alias: String = DEFAULT_ALIAS,
) {
    init { ensureKeyPair() }

    fun deviceId(): String = Base64.encodeToString(MessageDigest.getInstance("SHA-256").digest(publicKeySpki()), Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)

    fun signCanonical(timestampMillis: Long, urlPath: String): SignedRequest {
        require(timestampMillis in 1_000_000_000_000L..9_999_999_999_999L)
        require(urlPath.startsWith('/')) { "urlPath must start with /" }
        val timestamp = timestampMillis.toString()
        val canonical = "${deviceId()}.$timestamp.$urlPath"
        val signature = Signature.getInstance(SIGNATURE_ALGORITHM).apply {
            initSign(privateKey())
            update(canonical.toByteArray(Charsets.UTF_8))
        }.sign()
        return SignedRequest(deviceId = deviceId(), timestamp = timestamp, signatureBase64 = Base64.encodeToString(signature, Base64.NO_WRAP))
    }

    fun publicKeySpki(): ByteArray = publicKey().encoded

    private fun ensureKeyPair() {
        val store = keyStore()
        if (store.containsAlias(alias)) {
            require(store.getKey(alias, null) is PrivateKey) { "Bridge key alias is not a private key" }
            return
        }
        val generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, ANDROID_KEYSTORE)
        generator.initialize(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY).setDigests(KeyProperties.DIGEST_SHA256).setKeySize(256).build())
        generator.generateKeyPair()
    }

    private fun keyStore(): KeyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
    private fun privateKey(): PrivateKey = (keyStore().getKey(alias, null) as? PrivateKey) ?: error("Bridge private key unavailable")
    private fun publicKey() = keyStore().getCertificate(alias)?.publicKey ?: error("Bridge public key unavailable")

    data class SignedRequest(val deviceId: String, val timestamp: String, val signatureBase64: String)

    companion object {
        const val DEFAULT_ALIAS = "andrew_bridge_v3_device"
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        private const val SIGNATURE_ALGORITHM = "SHA256withECDSA"
    }
}
