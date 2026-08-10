FROM alpine:3.20

# AVR core metadata is required by arduino-cli even when uploading a prebuilt
# hex. The compiler is not used by this image.
RUN apk add --no-cache avrdude curl tar xz && \
    curl -fsSL https://downloads.arduino.cc/arduino-cli/arduino-cli_latest_Linux_64bit.tar.gz | tar -xz -C /usr/local/bin arduino-cli && \
    arduino-cli config init && arduino-cli core update-index && arduino-cli core install arduino:avr

ENTRYPOINT ["arduino-cli"]
