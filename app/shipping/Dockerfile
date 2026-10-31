#
# Build
#
FROM maven:3.8.6-eclipse-temurin-8 AS build

WORKDIR /opt/shipping

COPY pom.xml /opt/shipping/
RUN mvn dependency:resolve
COPY src /opt/shipping/src/
RUN mvn package -DskipTests

#
# Run
#
# Use the Ubuntu Java 8 runtime for both AMD64 and ARM64 CI builds.
FROM eclipse-temurin:8-jre-jammy

EXPOSE 8080

WORKDIR /opt/shipping

ENV CART_ENDPOINT=cart:8080
ENV DB_HOST=mysql

COPY --from=build /opt/shipping/target/shipping-1.0.jar shipping.jar

USER 1001:1001
CMD [ "java", "-Xmn256m", "-Xmx768m", "-jar", "shipping.jar" ]
