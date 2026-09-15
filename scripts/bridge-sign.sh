#!/usr/bin/env bash
set -euo pipefail

: "${BRIDGE_ECDSA_PRIVATE_KEY_B64:?BRIDGE_ECDSA_PRIVATE_KEY_B64 is required}"
: "${BRIDGE_ARTIFACT:?BRIDGE_ARTIFACT is required}"
: "${BRIDGE_WORKDIR:?BRIDGE_WORKDIR is required}"

mkdir -p "$BRIDGE_WORKDIR"
key="$BRIDGE_WORKDIR/signing-key.pem"
raw="$BRIDGE_WORKDIR/signing-key.raw"

candidate="$(printf '%s' "$BRIDGE_ECDSA_PRIVATE_KEY_B64" | tr -d '[:space:]')"
if printf '%s' "$candidate" | grep -q -- '-----BEGIN'; then
  printf '%s\n' "$candidate" | sed 's/\\n/\n/g' > "$key"
else
  encoded="$(printf '%s' "$candidate" | tr '_-' '/+' | tr -cd 'A-Za-z0-9+/=')"
  rem=$(( ${#encoded} % 4 ))
  if [ "$rem" -ne 0 ]; then encoded="${encoded}$(printf '%*s' $((4-rem)) '' | tr ' ' '=')"; fi
  printf '%s' "$encoded" | base64 --decode > "$raw"
  if grep -a -q -- '-----BEGIN' "$raw"; then
    sed 's/\\n/\n/g' "$raw" > "$key"
  elif openssl pkey -inform DER -in "$raw" -out "$key" 2>/dev/null; then
    :
  elif [ "$(wc -c < "$raw")" -eq 32 ]; then
    python3 - "$raw" "$key" <<'PY'
import pathlib,sys
raw=pathlib.Path(sys.argv[1]).read_bytes()
assert len(raw)==32
L=lambda n: bytes([n]) if n<128 else b"\x81"+bytes([n])
T=lambda t,v: bytes([t])+L(len(v))+v
oid=bytes.fromhex("06082a8648ce3d030107")
der=T(0x30,T(0x02,b"\x01")+T(0x04,raw)+T(0xa0,oid))
pathlib.Path(sys.argv[2]).write_bytes(der)
PY
    openssl pkey -inform DER -in "$key" -out "$key.tmp"
    mv "$key.tmp" "$key"
  else
    echo 'Invalid bridge signing key' >&2
    exit 1
  fi
fi

chmod 600 "$key"
openssl pkey -in "$key" -check -noout
key_type="$(openssl pkey -in "$key" -text -noout | grep -m1 'ASN1 OID:' | sed 's/.*ASN1 OID: //')"
test "$key_type" = "prime256v1"
sha256="$(sha256sum "$BRIDGE_ARTIFACT" | awk '{print $1}')"
printf '%s' "$sha256" | xxd -r -p > "$BRIDGE_WORKDIR/digest.bin"
openssl dgst -sha256 -sign "$key" -out "$BRIDGE_WORKDIR/signature.der" "$BRIDGE_WORKDIR/digest.bin"
openssl pkey -in "$key" -pubout -out "$BRIDGE_WORKDIR/public-key.pem"
openssl dgst -sha256 -verify "$BRIDGE_WORKDIR/public-key.pem" -signature "$BRIDGE_WORKDIR/signature.der" "$BRIDGE_WORKDIR/digest.bin"
signature="$(base64 -w0 "$BRIDGE_WORKDIR/signature.der")"
echo "BRIDGE_SHA256=$sha256" >> "$GITHUB_ENV"
echo "BRIDGE_SIGNATURE=$signature" >> "$GITHUB_ENV"
echo "ECDSA-P256/SHA256 artifact signature verified locally."
