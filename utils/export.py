"""Export and CLI table formatting utilities."""

import csv
import sys


def write_csv(columns, rows, path):
    with open(path, 'w', newline='', encoding='utf-8') as handle:
        writer = csv.writer(handle)
        writer.writerow(columns)
        for row in rows:
            writer.writerow(['' if value is None else value for value in row])
    print("Wrote {} rows x {} columns to {}".format(len(rows), len(columns), path))


def print_table(columns, rows):
    print('\t'.join(columns))
    print('\t'.join('-' * len(column) for column in columns))
    for row in rows:
        print('\t'.join('NULL' if value is None else str(value) for value in row))
    print("({} rows)".format(len(rows)), file=sys.stderr)
