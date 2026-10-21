FROM rust:1.83.0-slim-bookworm@sha256:540c902e99c384163b688bbd8b5b8520e94e7731b27f7bd0eaa56ae1960627ab
ENV PYTHONDONTWRITEBYTECODE=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip && rm -rf /var/lib/apt/lists/*
RUN pip3 install --break-system-packages pytest==8.3.3
RUN mkdir -p /opt/sdc && printf '%s\n' \
    '#define _GNU_SOURCE' \
    '#include <dlfcn.h>' \
    '#include <fcntl.h>' \
    '#include <stdlib.h>' \
    '#include <time.h>' \
    '#include <unistd.h>' \
    'static void note(void) {' \
    '  const char *p = getenv("SDC_FSYNC_LOG");' \
    '  if (p) { int fd = open(p, O_WRONLY | O_APPEND | O_CREAT, 0644); if (fd >= 0) { write(fd, "s", 1); close(fd); } }' \
    '  struct timespec ts = {0, 2000000}; nanosleep(&ts, NULL);' \
    '}' \
    'int fsync(int fd) { static int (*real)(int); if (!real) real = dlsym(RTLD_NEXT, "fsync"); note(); return real(fd); }' \
    'int fdatasync(int fd) { static int (*real)(int); if (!real) real = dlsym(RTLD_NEXT, "fdatasync"); note(); return real(fd); }' \
    > /opt/sdc/slowsync.c && gcc -O2 -shared -fPIC -o /opt/sdc/slowsync.so /opt/sdc/slowsync.c -ldl
COPY requirements.txt /tmp/requirements.txt
RUN useradd -m runner
ENV CARGO_HOME=/home/runner/.cargo
USER runner
WORKDIR /work
