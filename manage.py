#!/usr/bin/env python
import os
import sys

def main():
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'apt_project.settings.base')
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Django를 찾을 수 없습니다. pip install -r requirements.txt 를 실행하세요."
        ) from exc
    execute_from_command_line(sys.argv)

if __name__ == '__main__':
    main()
