# Stage 1: Build JAR using Maven
FROM maven:3.9.9-eclipse-temurin-17 AS builder
WORKDIR /app

# Maven resource plugin copies migrations from /database/migrations into the jar.
COPY backend/pom.xml .
COPY database/migrations /database/migrations
RUN mvn dependency:go-offline -B

# Copy source and build package
COPY backend/src ./src
RUN mvn package -DskipTests -B

# Stage 2: Runtime image using JRE
FROM eclipse-temurin:17-jre-alpine
WORKDIR /app

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

COPY --from=builder /app/target/backend-*.jar app.jar

EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
  CMD wget -qO- http://localhost:8080/actuator/health || exit 1

ENTRYPOINT ["java", "-jar", "app.jar"]
